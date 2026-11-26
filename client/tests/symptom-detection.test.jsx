import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '../src/renderer/src/i18n/index.js'
import { searchSymptoms, loadSymptomCatalog, displayName, fullNameTitle, isExamCode } from '../src/renderer/src/api/symptoms'
import SymptomChecklist from '../src/renderer/src/components/SymptomChecklist.jsx'
import { ConfirmedSymptoms } from '../src/renderer/src/pages/doctor/consult/ConfirmedSymptoms.jsx'
import ExamSigns from '../src/renderer/src/pages/doctor/consult/ExamSigns.jsx'
import AssessmentCard from '../src/renderer/src/pages/doctor/AssessmentCard.jsx'
import { ToastProvider } from '../src/renderer/src/context/ToastContext.jsx'
import { initial, bodyOf, problem } from '../src/renderer/src/pages/admin/knowledge/itemForm.js'

// 0.2.5: tên ngắn, từ đồng nghĩa, nguồn phát hiện (reported / exam / both), phạm vi trọng tâm.
const CATALOG = [
  { symptom_code: 'fever_high', symptom_name: 'Sốt cao (>= 38.5°C hoặc sốt cao đột ngột)', short_name: 'Sốt cao', category: 'constitutional', detection: 'reported' },
  { symptom_code: 'cough_dry', symptom_name: 'Ho khan', short_name: null, category: 'respiratory', detection: 'both' },
  { symptom_code: 'tonsil_exudate', symptom_name: 'Amidan sưng có mủ trắng', short_name: 'Mủ amidan', category: 'ent', detection: 'exam' },
  { symptom_code: 'neck_stiff', symptom_name: 'Cứng gáy khi khám', short_name: '', category: 'neurological', detection: 'exam' }
]
let calls = []
let assessmentStatus = 403
beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const u = String(url)
      calls.push({ url: u, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null })
      const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
      if (u.endsWith('/api/v1/symptoms')) return json(CATALOG)
      if (u.endsWith('/symptoms') && init.method === 'PUT') {
        const { symptoms } = JSON.parse(init.body)
        return json(symptoms.map((s) => ({ ...s, symptom_name: CATALOG.find((c) => c.symptom_code === s.symptom_code)?.symptom_name, confirmed_at: '2026-11-17T03:00:00Z' })))
      }
      if (u.endsWith('/assessment') && init.method === 'POST') return assessmentStatus === 202 ? json({}, 202) : json({ error: { code: 'FORBIDDEN', message: 'Không có quyền' } }, 403)
      return json({})
    })
  )
  await loadSymptomCatalog()
})
afterEach(() => (cleanup(), (calls = [])))
afterAll(() => vi.unstubAllGlobals())

describe('danh mục triệu chứng', () => {
  it('tên ngắn hiển thị, tên đầy đủ ở tooltip; tên ngắn trống thì dùng tên đầy đủ', () => {
    const fever = { key: 'fever_high', label: CATALOG[0].symptom_name, short: 'Sốt cao' }
    expect(displayName(fever)).toBe('Sốt cao')
    expect(fullNameTitle(fever)).toBe(CATALOG[0].symptom_name)
    expect(displayName({ key: 'cough_dry', label: 'Ho khan', short: '' })).toBe('Ho khan')
    expect(fullNameTitle({ key: 'cough_dry', label: 'Ho khan', short: '' })).toBeUndefined()
  })
  it('tìm theo cả tên ngắn', () => {
    const list = [{ key: 'tonsil_exudate', label: 'Amidan sưng có mủ trắng', short: 'Mủ amidan' }]
    expect(searchSymptoms(list, 'mu amidan').map((s) => s.key)).toEqual(['tonsil_exudate'])
  })
  it('nhận biết mã exam', () => {
    expect(isExamCode('tonsil_exudate')).toBe(true)
    expect(isExamCode('cough_dry')).toBe(false)
  })
})

describe('màn tiếp đón', () => {
  it('ẩn dấu hiệu khi khám, hiện tên ngắn kèm tooltip tên đầy đủ', () => {
    render(<SymptomChecklist value={{}} onSet={() => {}} />)
    fireEvent.click(screen.getByText('General symptoms'))
    const fever = screen.getByText('Sốt cao')
    expect(fever.closest('.sn').getAttribute('title')).toBe(CATALOG[0].symptom_name)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'amidan' } })
    expect(screen.queryByText('Mủ amidan')).toBeNull()
    expect(screen.getByText('No matching symptom.')).toBeTruthy()
  })
})

const VISIT_SYMPTOMS = [
  { symptom_code: 'fever_high', symptom_name: CATALOG[0].symptom_name, state: 'PRESENT', source: 'Extracted' },
  { symptom_code: 'cough_dry', symptom_name: 'Ho khan', state: 'ABSENT', source: 'Form' },
  { symptom_code: 'neck_stiff', symptom_name: 'Cứng gáy khi khám', state: 'ABSENT', source: 'Form' }
]

describe('màn bác sĩ', () => {
  it('phần S chỉ hiện triệu chứng bệnh nhân kể, dùng tên ngắn', () => {
    const { container } = render(<ConfirmedSymptoms list={VISIT_SYMPTOMS} />)
    expect(container.textContent).toContain('Sốt cao')
    expect(container.textContent).toContain('Ho khan')
    expect(container.textContent).not.toContain('Cứng gáy')
  })

  it('lưu dấu hiệu khi khám: gửi kèm nguyên triệu chứng lễ tân đã xác nhận (giữ nguồn), báo khi chưa chạy lại được AI', async () => {
    const onSaved = vi.fn()
    const onRerun = vi.fn()
    render(
      <ToastProvider>
        <ExamSigns visitId="v1" symptoms={VISIT_SYMPTOMS} onSaved={onSaved} onRerun={onRerun} />
      </ToastProvider>
    )
    const row = screen.getByText('Mủ amidan').closest('.sym-r')
    expect(screen.getByText('Mủ amidan').getAttribute('title')).toBe('Amidan sưng có mủ trắng')
    fireEvent.click(within(row).getByRole('button', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: /Save examination signs/ }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const put = calls.find((c) => c.method === 'PUT')
    expect(put.url).toContain('/visits/v1/symptoms')
    expect(put.body.symptoms).toEqual([
      { symptom_code: 'fever_high', state: 'PRESENT', source: 'Extracted' },
      { symptom_code: 'cough_dry', state: 'ABSENT', source: 'Form' },
      { symptom_code: 'neck_stiff', state: 'ABSENT', source: 'Form' },
      { symptom_code: 'tonsil_exudate', state: 'PRESENT', source: 'Form' }
    ])
    await screen.findByText(/does not include these signs yet/)
    expect(onRerun).not.toHaveBeenCalled()
  })

  it('chạy lại AI được thì báo cho trang cha hỏi lại kết quả', async () => {
    assessmentStatus = 202
    const onRerun = vi.fn()
    render(
      <ToastProvider>
        <ExamSigns visitId="v1" symptoms={[]} onSaved={() => {}} onRerun={onRerun} />
      </ToastProvider>
    )
    fireEvent.click(within(screen.getByText('Cứng gáy khi khám').closest('.sym-r')).getByRole('button', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: /Save examination signs/ }))
    await waitFor(() => expect(onRerun).toHaveBeenCalled())
    assessmentStatus = 403
  })

  it('bệnh ngoài phạm vi trọng tâm có nhãn; server cũ (không có trường) thì không', () => {
    const cand = (code, extra) => ({ condition_code: code, rank: 1, name_vi: code, icd10_code: null, score: 0.5, supporting: [], contradicting: [], missing: [], explanation: '', ...extra })
    const a = { ai_status: 'Ready', alerts: [], complete_now: [], candidates: [cand('gout', { in_focus_scope: false }), cand('flu', { in_focus_scope: true }), cand('old', {})] }
    const { container } = render(<AssessmentCard a={a} decisions={{}} onAccept={() => {}} onDismiss={() => {}} />)
    expect(container.querySelectorAll('.scope-tag')).toHaveLength(1)
    expect(screen.getByText('Outside focus scope, not clinically validated')).toBeTruthy()
  })
})

describe('form triệu chứng ở Quản trị tri thức', () => {
  it('đọc và gửi short_name, aliases, detection đúng schema', () => {
    const f = initial('symptoms', { values: { symptom_name: 'Sốt', short_name: 'Sốt', aliases: ['nóng sốt', 'sốt nóng'], detection: 'reported' } }, [])
    expect(f.aliases).toBe('nóng sốt\nsốt nóng')
    expect(bodyOf('symptoms', { ...f, short_name: '  ', aliases: ' nóng   sốt \n\n sốt nóng ' })).toEqual({
      symptom_name: 'Sốt',
      short_name: null,
      aliases: ['nóng sốt', 'sốt nóng'],
      detection: 'reported',
      category: null,
      applicable_sex: 'Any'
    })
    expect(initial('symptoms', null, []).detection).toBe('both')
  })
  it('giới tính áp dụng: đọc / gửi applicable_sex, giá trị lạ hoặc thiếu → Any', () => {
    expect(initial('symptoms', { values: { symptom_name: 'Khí hư', applicable_sex: 'Female' } }, []).applicable_sex).toBe('Female')
    expect(initial('conditions', { values: { name_vi: 'Viêm tuyến tiền liệt', applicable_sex: 'Male' } }, []).applicable_sex).toBe('Male')
    expect(initial('conditions', null, []).applicable_sex).toBe('Any')
    expect(bodyOf('conditions', { name_vi: 'X', icd10_code: '', disease_group: '', description: '', applicable_sex: 'Female' }).applicable_sex).toBe('Female')
    expect(bodyOf('conditions', { name_vi: 'X', icd10_code: '', disease_group: '', description: '' }).applicable_sex).toBe('Any')
  })
  it('chặn tên ngắn quá dài và từ đồng nghĩa trùng (không phân biệt dấu)', () => {
    const f = { ...initial('symptoms', null, []), symptom_name: 'Sốt' }
    expect(problem('symptoms', 'sot', { ...f, short_name: 'x'.repeat(31) }, false)).toBe('Short name is at most 30 characters')
    expect(problem('symptoms', 'sot', { ...f, aliases: 'nóng sốt\nnong sot' }, false)).toContain('Duplicate synonym')
    expect(problem('symptoms', 'sot', { ...f, aliases: Array.from({ length: 16 }, (_, i) => 'a' + i).join('\n') }, false)).toBe('At most 15 synonyms')
    expect(problem('symptoms', 'sot', { ...f, aliases: 'nóng sốt' }, false)).toBeNull()
  })
})
