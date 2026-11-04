import { describe, it, expect, afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react'
import '../src/renderer/src/i18n/index.js'
import { groupSymptoms, searchSymptoms, loadSymptomCatalog } from '../src/renderer/src/api/symptoms'

// Khung “Đọc lời kể & đề xuất” (Việc 2) và danh sách triệu chứng mới (Việc 3).
// Trạng thái AI lấy từ /health (ai.reason) — ở đây giả lập để đổi qua lại trong cùng một test.
let ai = { ok: true, reason: null, detail: '' }
const aiSubs = new Set()
const setAi = (next) => act(() => ((ai = next), aiSubs.forEach((f) => f())))
vi.mock('../src/renderer/src/api/connectivity', async () => {
  const { useSyncExternalStore } = await import('react')
  return { useAiHealth: () => useSyncExternalStore((f) => (aiSubs.add(f), () => aiSubs.delete(f)), () => ai) }
})
const { default: SymptomPanel } = await import('../src/renderer/src/components/SymptomPanel.jsx')

// Danh mục giống KB thật: các category mới, out_of_scope_symptom thuộc system_safety.
const CATALOG = [
  { symptom_code: 'fever_high', symptom_name: 'Sốt cao', category: 'constitutional' },
  { symptom_code: 'rash_fever', symptom_name: 'Phát ban kèm sốt', category: 'infectious_sign' },
  { symptom_code: 'out_of_scope_symptom', symptom_name: 'Triệu chứng nguy hiểm ngoài danh mục chuẩn', category: 'system_safety' },
  { symptom_code: 'sym_seizures', symptom_name: 'Co giật toàn thân', category: 'red_flag_sign' },
  { symptom_code: 'cough_dry', symptom_name: 'Ho khan', category: 'respiratory' },
  { symptom_code: 'sore_throat', symptom_name: 'Đau họng', category: 'ent' },
  { symptom_code: 'red_eye', symptom_name: 'Đỏ mắt', category: 'ophthalmology' },
  { symptom_code: 'abdominal_pain', symptom_name: 'Đau bụng', category: 'gastrointestinal' }
]
beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const body = String(url).endsWith('/api/v1/symptoms') ? CATALOG : {}
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
  )
  // Nạp danh mục trước: vài test dùng đồng hồ giả.
  await loadSymptomCatalog()
})
beforeEach(() => (ai = { ok: true, reason: null, detail: '' }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
afterAll(() => vi.unstubAllGlobals())

const list = CATALOG.map((r) => ({ key: r.symptom_code, label: r.symptom_name, category: r.category }))

describe('Nhóm triệu chứng (symptoms.js)', () => {
  it('đúng thứ tự nhóm, gộp Toàn thân + dấu hiệu nhiễm trùng, không có nhóm “Khác”', () => {
    const g = groupSymptoms(list)
    expect(g.map((x) => x.key)).toEqual(['danger', 'general', 'respiratory', 'ent', 'eye', 'gi'])
    expect(g[1].items.map((s) => s.key)).toEqual(['fever_high', 'rash_fever'])
  })

  it('“ngoài danh mục” đứng cuối nhóm Dấu hiệu nguy hiểm', () => {
    expect(groupSymptoms(list)[0].items.map((s) => s.key)).toEqual(['sym_seizures', 'out_of_scope_symptom'])
  })

  it('category client chưa biết → vẫn hiện (nhóm “Khác”), không làm mất mục', () => {
    const g = groupSymptoms([...list, { key: 'x', label: 'Mới', category: 'cardiology' }])
    expect(g.at(-1)).toMatchObject({ key: 'other', items: [{ key: 'x' }] })
  })

  it('tìm không dấu, nhiều từ', () => {
    expect(searchSymptoms(list, 'dau bung').map((s) => s.key)).toEqual(['abdominal_pain'])
    expect(searchSymptoms(list, 'DAU').map((s) => s.key)).toEqual(['sore_throat', 'abdominal_pain'])
    expect(searchSymptoms(list, '  ')).toEqual([])
  })
})

function Harness({ onExtract, initial = {} }) {
  const [syms, setSyms] = useState(initial)
  const [text, setText] = useState('Sốt cao 2 ngày, ho khan')
  return (
    <>
      <SymptomPanel value={syms} onChange={setSyms} text={text} onText={setText} onExtract={onExtract} />
      <output data-testid="syms">{JSON.stringify(syms)}</output>
    </>
  )
}
const syms = () => JSON.parse(screen.getByTestId('syms').textContent)
const mainButton = () => screen.queryByText('Read description & suggest')?.closest('button') ?? null
const result = { proposals: [{ symptom_code: 'fever_high', state: 'PRESENT' }, { symptom_code: 'cough_dry', state: 'ABSENT' }], unsure: [], vitalProposals: [], textChanged: false }

// onExtract điều khiển tay: báo tiến trình và trả kết quả khi test muốn.
function controlled() {
  const c = {}
  c.fn = vi.fn((text, opts) => {
    c.opts = opts
    return new Promise((ok, fail) => Object.assign(c, { ok, fail }))
  })
  c.progress = (status, queueAhead = null) => act(() => c.opts.onProgress({ status, queueAhead }))
  c.resolve = (r = result) => act(async () => c.ok(r))
  return c
}
const step = (label) => screen.getByText(label).closest('li')

describe('Khung “Đọc lời kể & đề xuất”', () => {
  it('các bước sáng theo status server, có số lượt phía trước, đồng hồ và thanh theo thời gian', async () => {
    vi.useFakeTimers()
    const c = controlled()
    render(<Harness onExtract={c.fn} />)
    fireEvent.click(mainButton())
    expect(mainButton()).toBeNull() // đang chạy: ẩn nút chính, hiện tiến trình
    expect(step('Description saved').className).toBe('active')
    c.progress('Queued', 2)
    expect(step('Description saved').className).toBe('done')
    expect(step('Waiting for the model').className).toBe('active')
    expect(screen.getByText('2 ahead in line')).toBeTruthy()
    c.progress('Running', 0)
    expect(step('The model is reading').className).toBe('active')
    expect(screen.queryByText(/ahead in line/)).toBeNull()
    act(() => vi.advanceTimersByTime(15000))
    expect(screen.getByText('15 s')).toBeTruthy()
    expect(screen.getByText(/at most 15 s left/)).toBeTruthy()
    expect(screen.getByRole('progressbar').firstChild.style.width).toBe('50%')
    expect(screen.getByText('Stop waiting for the result')).toBeTruthy()
    expect(screen.getByText('You can enter vital signs while waiting.')).toBeTruthy()
    act(() => vi.advanceTimersByTime(3000))
    await c.resolve()
    // Xong: ẩn tiến trình, hiện dòng tóm tắt và nút để chạy lại.
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText('Last read: 18 s · 2 suggestions')).toBeTruthy()
    expect(mainButton().disabled).toBe(false)
    // Đề xuất chia hai cột Có / Không.
    const [yes, no] = document.querySelectorAll('.sym-prop-col')
    expect(within(yes).getByText('Sốt cao')).toBeTruthy()
    expect(within(no).getByText('Ho khan')).toBeTruthy()
  })

  it('client chờ tối đa 35 giây tính từ lúc bấm (gửi phần còn lại cho hàm trích xuất)', () => {
    vi.useFakeTimers()
    const c = controlled()
    render(<Harness onExtract={c.fn} />)
    fireEvent.click(mainButton())
    expect(c.opts.timeoutMs).toBeLessThanOrEqual(35000)
    expect(c.opts.timeoutMs).toBeGreaterThan(34000)
    act(() => vi.advanceTimersByTime(34900))
    expect(c.opts.signal.aborted).toBe(false)
    act(() => vi.advanceTimersByTime(200))
    expect(c.opts.signal.aborted).toBe(true)
  })

  it('quá giờ → khung vàng nêu lý do, nút Thử lại, nhắc chọn trong danh sách', async () => {
    vi.useFakeTimers()
    const c = controlled()
    render(<Harness onExtract={c.fn} />)
    fireEvent.click(mainButton())
    act(() => vi.advanceTimersByTime(35000))
    await act(async () => c.fail(Object.assign(new Error('aborted'), { code: 'ABORTED' })))
    const box = screen.getByText('No result within 30 seconds.').closest('.sym-alert')
    expect(box.textContent).toContain('Pick the symptoms in the list below.')
    fireEvent.click(within(box).getByText('Try again'))
    expect(c.fn).toHaveBeenCalledTimes(2)
  })

  it('Hủy chỉ ngừng chờ: kết quả của lượt cũ về muộn bị bỏ qua', async () => {
    const c = controlled()
    render(<Harness onExtract={c.fn} />)
    fireEvent.click(mainButton())
    fireEvent.click(screen.getByText('Cancel'))
    expect(c.opts.signal.aborted).toBe(true)
    expect(mainButton()).toBeTruthy()
    await c.resolve()
    expect(screen.queryByText('Suggested — confirm before use')).toBeNull()
    expect(screen.queryByText(/Last read/)).toBeNull()
  })

  it('AI tắt trong cấu hình (disabled) → ẩn hẳn khung', () => {
    ai = { ok: false, reason: 'disabled', detail: 'LLM đang tắt' }
    render(<Harness onExtract={vi.fn()} />)
    expect(mainButton()).toBeNull()
    expect(document.querySelector('.sym-ai')).toBeNull()
  })

  it.each(['unreachable', 'no_model', 'worker_stopped'])('AI %s → khung vàng kèm detail, khoá nút; ok lại thì tự mở', (reason) => {
    ai = { ok: false, reason, detail: 'Không kết nối được Ollama' }
    render(<Harness onExtract={vi.fn()} />)
    expect(screen.getByText('Suggestions from the description are unavailable for now — pick the symptoms in the list below.')).toBeTruthy()
    expect(screen.getByText('Không kết nối được Ollama')).toBeTruthy()
    expect(mainButton().disabled).toBe(true)
    setAi({ ok: true, reason: null, detail: '' })
    expect(screen.queryByText(/unavailable for now/)).toBeNull()
    expect(mainButton().disabled).toBe(false)
  })
})

describe('Danh sách triệu chứng', () => {
  it('tìm không dấu → chọn Có ngay trong kết quả', async () => {
    render(<Harness onExtract={vi.fn()} />)
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'dau bung' } })
    const row = within(document.querySelector('.sym-results')).getByText('Đau bụng').closest('.sym-row')
    fireEvent.click(within(row).getByText('Yes'))
    expect(syms()).toEqual({ abdominal_pain: { state: 'PRESENT', source: 'Form' } })
  })

  it('“Đã xác nhận”: dấu hiệu nguy hiểm lên đầu, nhãn nguồn, đổi Có/Không, bỏ chọn', async () => {
    render(<Harness onExtract={vi.fn()} initial={{ cough_dry: { state: 'PRESENT', source: 'Extracted' }, sym_seizures: { state: 'PRESENT', source: 'Form' } }} />)
    await screen.findByRole('searchbox')
    const box = document.querySelector('.sym-section.confirmed')
    expect(box.querySelector('.sym-count').textContent).toBe('2')
    const rows = [...box.querySelectorAll('.sym-row')]
    expect(rows.map((r) => r.querySelector('.sym-name').firstChild.textContent)).toEqual(['Co giật toàn thân', 'Ho khan'])
    expect(rows[0].textContent).toContain('Picked by nurse')
    expect(rows[1].textContent).toContain('From description')
    fireEvent.click(within(rows[1]).getByText('No'))
    expect(syms().cough_dry).toEqual({ state: 'ABSENT', source: 'Form' })
    fireEvent.click(within(rows[0]).getByTitle('Remove'))
    expect(syms().sym_seizures).toBeUndefined()
  })

  it('Dấu hiệu nguy hiểm mở sẵn (có mục “ngoài danh mục” kèm gợi ý); nhóm khác đóng, tiêu đề có số đã chọn', async () => {
    render(<Harness onExtract={vi.fn()} initial={{ cough_dry: { state: 'PRESENT', source: 'Form' } }} />)
    await screen.findByRole('searchbox')
    const danger = document.querySelector('.sym-section.danger')
    expect(within(danger).getByText('Dangerous sign not in the list')).toBeTruthy()
    expect(within(danger).getByText(/multiple trauma, heavy bleeding/)).toBeTruthy()
    const resp = screen.getByText('Respiratory').closest('button')
    expect(resp.getAttribute('aria-expanded')).toBe('false')
    expect(resp.textContent).toContain('1 selected')
    expect(screen.queryByText('Other')).toBeNull()
    fireEvent.click(resp)
    expect(resp.closest('.sym-section').querySelector('.sym-row.set')).toBeTruthy()
  })
})
