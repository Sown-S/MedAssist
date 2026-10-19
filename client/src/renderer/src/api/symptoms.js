// TRIỆU CHỨNG CÓ CẤU TRÚC (FR12, FR14 — Architecture 5.1.2).
// Mỗi triệu chứng của danh mục Active có MỘT trạng thái trong lượt khám: PRESENT | ABSENT | UNKNOWN,
// kèm nguồn: Form (lễ tân chọn), Extracted (đề xuất từ mô tả tự do, ĐÃ được lễ tân xác nhận), Prompt (hỏi theo nhắc thiếu thông tin).
// Chỉ triệu chứng ĐÃ XÁC NHẬN mới được lưu (VISIT_SYMPTOM) và đưa vào luật / AI — đề xuất chưa xác nhận không bao giờ được dùng.
import { useEffect, useSyncExternalStore } from 'react'
import { SYMPTOMS, symptomLabel } from '../pages/admin/ai/catalog'
import { extractCase } from '../pages/admin/ai/ruleEngine'
import { getState as getAIConfig } from './aiConfigStore'
import { apiGet, DEMO_MODE } from './client'

export const STATES = [
  { key: 'PRESENT', label: 'Yes', short: 'Yes' },
  { key: 'ABSENT', label: 'No', short: 'No' },
  { key: 'UNKNOWN', label: 'Not sure', short: '?' }
]
export const SOURCES = { Form: 'Entered', Extracted: 'From description', Prompt: 'Asked (missing info)' }

// Danh mục triệu chứng đang dùng: [{ key, label, category }].
//  - Demo: danh mục mẫu trong catalog.js (bộ luật giả lập dùng đúng các mã này);
//  - API thật: GET /api/v1/symptoms — mã OKF chuẩn, tên tiếng Việt, nhóm. Chỉ mã trong danh mục này
//    mới gửi được lên PUT /visits/{id}/symptoms (mã lạ → 422 UNKNOWN_SYMPTOM).
let snapshot = { list: DEMO_MODE ? SYMPTOMS : [], status: DEMO_MODE ? 'ready' : 'idle' } // idle | loading | ready | failed
const listeners = new Set()
function publish(next) {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((fn) => fn())
}

export async function loadSymptomCatalog() {
  if (DEMO_MODE || snapshot.status === 'loading') return
  publish({ status: 'loading' })
  try {
    const rows = await apiGet('/api/v1/symptoms')
    publish({ list: rows.map((r) => ({ key: r.symptom_code, label: r.symptom_name, category: r.category })), status: 'ready' })
  } catch {
    publish({ status: 'failed' })
  }
}

export const activeSymptoms = () => snapshot.list
// Tên hiển thị của một mã: theo danh mục đang dùng, không có thì tra danh mục mẫu, cuối cùng là chính mã.
export const symptomName = (code) => snapshot.list.find((s) => s.key === code)?.label ?? symptomLabel(code)

// Hook cho màn hình: tự tải danh mục lần đầu (API thật), cập nhật khi tải xong.
export function useSymptomCatalog() {
  const s = useSyncExternalStore((fn) => (listeners.add(fn), () => listeners.delete(fn)), () => snapshot)
  useEffect(() => {
    if (s.status === 'idle') loadSymptomCatalog()
  }, [s.status])
  return { ...s, reload: loadSymptomCatalog }
}

// Nhóm hiển thị theo category của OKF; dấu hiệu nguy hiểm lên đầu. Danh mục mẫu (không có nhóm) → một nhóm.
const GROUPS = [
  ['red_flag_sign', 'Warning signs'],
  ['constitutional', 'General symptoms'],
  ['respiratory_ent', 'Respiratory & ENT'],
  ['gastrointestinal', 'Digestive'],
  ['musculoskeletal', 'Musculoskeletal'],
  ['dermatologic', 'Skin']
]
export function groupSymptoms(list) {
  if (!list.some((s) => s.category)) return [{ key: '', label: '', items: list }]
  const known = new Set(GROUPS.map(([k]) => k))
  return [
    ...GROUPS.map(([key, label]) => ({ key, label, items: list.filter((s) => s.category === key) })),
    { key: 'other', label: 'Other', items: list.filter((s) => !known.has(s.category)) }
  ].filter((g) => g.items.length)
}

// { code: { state, source } } → mảng gửi lên server (bỏ UNKNOWN không ai chọn — mặc định đã là UNKNOWN).
export const toPayload = (map) =>
  Object.entries(map)
    .filter(([, x]) => x && x.state !== 'UNKNOWN')
    .map(([code, x]) => ({ symptom_code: code, state: x.state, source: x.source }))

// Mảng đã lưu → { code: state } cho bộ luật. Mã không có = UNKNOWN.
export const statesOf = (list) => Object.fromEntries((list ?? []).map((x) => [x.symptom_code, x.state]))

// ---------- Trích xuất từ mô tả tự do (GIẢ LẬP) ----------
// Backend thật: POST /api/v1/visits/{id}/extraction → 202 Accepted; client polling GET …/extraction (~2 s một lần)
// tới khi status = Completed | Failed (LLM cục bộ, che thông tin định danh, timeout 30 s — NFR01).
// Bản demo dùng bộ từ điển đồng nghĩa thay cho LLM, có độ trễ để giao diện viết đúng luồng bất đồng bộ.
// Đặt localStorage medassist_mock_llm_down = '1' để thử trường hợp trích xuất lỗi.
export const EXTRACTION_TIMEOUT_MS = 30000

export function requestExtraction(text, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const down = (() => {
      try {
        return localStorage.getItem('medassist_mock_llm_down') === '1'
      } catch {
        return false
      }
    })()
    const t = setTimeout(() => {
      if (down) return reject(Object.assign(new Error('Extraction unavailable'), { code: 'AI_UNAVAILABLE' }))
      const ai = getAIConfig()
      const ex = extractCase(text, ai.synonyms ?? {})
      const known = new Set(activeSymptoms().map((s) => s.key))
      // Node "giữ đúng danh mục": mã ngoài danh mục Active bị loại (giống kiểm tra phía server).
      const proposals = [
        ...ex.found.filter((f) => known.has(f.key)).map((f) => ({ symptom_code: f.key, state: 'PRESENT', phrase: f.phrase })),
        ...[...ex.symptoms].filter((k) => known.has(k) && !ex.found.some((f) => f.key === k)).map((k) => ({ symptom_code: k, state: 'PRESENT', phrase: '' })),
        ...ex.negated.filter((k) => known.has(k)).map((k) => ({ symptom_code: k, state: 'ABSENT', phrase: '' }))
      ]
      resolve({ status: 'Completed', proposals })
    }, 900 + Math.random() * 900)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(Object.assign(new Error('aborted'), { code: 'ABORTED' }))
    })
  })
}
