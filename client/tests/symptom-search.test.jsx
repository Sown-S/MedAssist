import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import '../src/renderer/src/i18n/index.js'
import { searchSymptoms, loadSymptomCatalog, symptomOf } from '../src/renderer/src/api/symptoms'
import SymptomChecklist from '../src/renderer/src/components/SymptomChecklist.jsx'

// Tên dài kiểu KB-2026.10: nhiều tên có “hoặc”, nhiều mục cùng mở đầu “Đau”.
const CATALOG = [
  { symptom_code: 'fever_high', symptom_name: 'Sốt cao (>= 38.5°C hoặc sốt cao đột ngột, liên tục)', category: 'constitutional' },
  { symptom_code: 'chills', symptom_name: 'Ớn lạnh, gai rét hoặc rét run thành cơn', category: 'constitutional' },
  { symptom_code: 'dizzy', symptom_name: 'Hoa mắt, chóng mặt', category: 'neurological' },
  { symptom_code: 'night_cough', symptom_name: 'Khó thở về đêm, ho nhiều khi nằm', category: 'respiratory' },
  { symptom_code: 'cough_dry', symptom_name: 'Ho khan, ho từng cơn', category: 'respiratory' },
  ...['đầu', 'họng', 'bụng', 'ngực', 'lưng', 'khớp gối', 'tai', 'răng', 'mắt', 'vai'].map((p, i) => ({
    symptom_code: `pain_${i}`,
    symptom_name: `Đau ${p}`,
    category: 'musculoskeletal'
  })),
  // Từ đồng nghĩa (GET /symptoms trả aliases): bệnh nhân nói “sổ mũi”, tên chuẩn là “Chảy nước mũi…”.
  { symptom_code: 'rhinorrhea_nasal_congestion', symptom_name: 'Chảy nước mũi, nghẹt mũi', category: 'respiratory', aliases: ['sổ mũi', ' tắc mũi ', ''] },
  { symptom_code: 'nasal_bleed', symptom_name: 'Chảy máu mũi', short_name: 'Sổ máu mũi', category: 'respiratory' }
]
const list = CATALOG.map((r) => ({ key: r.symptom_code, label: r.symptom_name, short: r.short_name ?? '', aliases: (r.aliases ?? []).map((a) => a.trim()).filter(Boolean), category: r.category }))
const keys = (q) => searchSymptoms(list, q).map((s) => s.key)

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const body = String(url).endsWith('/api/v1/symptoms') ? CATALOG : {}
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
  )
  await loadSymptomCatalog()
})
afterEach(() => cleanup())
afterAll(() => vi.unstubAllGlobals())

describe('searchSymptoms', () => {
  it('“ho” không khớp chữ “hoặc”; tên mở đầu bằng “Ho” lên trước, rồi tên có từ “ho”, cuối cùng là khớp đầu từ', () => {
    expect(keys('ho')).toEqual(['cough_dry', 'night_cough', 'dizzy', 'pain_1'])
  })

  it('khớp theo đầu từ, không khớp giữa từ', () => {
    expect(keys('ret')).toEqual(['chills'])
    expect(keys('et')).toEqual([])
  })

  it('từ cuối đang gõ dở vẫn tìm được', () => {
    expect(keys('dau bu')).toEqual(['pain_2'])
    expect(keys('kho tho')).toEqual(['night_cough'])
  })

  it('trả đủ mọi mục khớp, không cắt bớt', () => {
    expect(keys('dau')).toHaveLength(10)
  })

  it('tìm được theo từ đồng nghĩa, có dấu hay không dấu', () => {
    expect(keys('sổ mũi')).toContain('rhinorrhea_nasal_congestion')
    expect(keys('so mui')).toContain('rhinorrhea_nasal_congestion')
    expect(keys('tac')).toEqual(['rhinorrhea_nasal_congestion'])
  })

  it('cùng mức khớp thì mục khớp theo tên đứng trước mục chỉ khớp theo từ đồng nghĩa', () => {
    // “so m” khớp đầu từ ở cả tên ngắn “Sổ máu mũi” lẫn từ đồng nghĩa “sổ mũi” (cùng mức) → khớp theo tên lên trước.
    expect(keys('so m')).toEqual(['nasal_bleed', 'rhinorrhea_nasal_congestion'])
    // Từ đồng nghĩa khớp đúng thứ tự từ (mức tốt hơn) thì vẫn lên trước tên chỉ chứa đủ các từ.
    expect(keys('so mui')).toEqual(['rhinorrhea_nasal_congestion', 'nasal_bleed'])
  })

  it('đọc aliases từ danh mục server, bỏ khoảng trắng thừa và mục rỗng', () => {
    expect(symptomOf('rhinorrhea_nasal_congestion').aliases).toEqual(['sổ mũi', 'tắc mũi'])
    expect(symptomOf('cough_dry').aliases).toEqual([])
  })
})

describe('Ô tìm triệu chứng', () => {
  it('quá 8 kết quả thì có nút hiện thêm; bấm hiện hết; gõ lại thì thu gọn', async () => {
    render(<SymptomChecklist value={{}} onSet={() => {}} />)
    const box = await screen.findByRole('searchbox')
    fireEvent.change(box, { target: { value: 'dau' } })
    const results = () => document.querySelector('.sym-results')
    expect(results().querySelectorAll('.sym-r')).toHaveLength(8)
    fireEvent.click(within(results()).getByText('Show 2 more'))
    expect(results().querySelectorAll('.sym-r')).toHaveLength(10)
    expect(within(results()).queryByText(/more$/)).toBeNull()
    fireEvent.change(box, { target: { value: 'da' } })
    expect(results().querySelectorAll('.sym-r')).toHaveLength(8)
  })

  it('gõ “sổ mũi” ra triệu chứng chảy nước mũi', async () => {
    render(<SymptomChecklist value={{}} onSet={() => {}} />)
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'sổ mũi' } })
    expect(within(document.querySelector('.sym-results')).getByText(/Chảy nước mũi/)).toBeTruthy()
  })

  it('không quá 8 kết quả thì không có nút', async () => {
    render(<SymptomChecklist value={{}} onSet={() => {}} />)
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'ho' } })
    expect(within(document.querySelector('.sym-results')).queryByText(/more$/)).toBeNull()
  })
})
