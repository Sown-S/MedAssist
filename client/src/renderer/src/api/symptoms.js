// TRIỆU CHỨNG CÓ CẤU TRÚC (FR12, FR14 — Architecture 5.1.2).
// Mỗi triệu chứng của danh mục Active có MỘT trạng thái trong lượt khám: PRESENT | ABSENT | UNKNOWN,
// kèm nguồn: Form (lễ tân chọn), Extracted (đề xuất từ mô tả tự do, ĐÃ được lễ tân xác nhận), Prompt (hỏi theo nhắc thiếu thông tin).
// Chỉ triệu chứng ĐÃ XÁC NHẬN mới được lưu (VISIT_SYMPTOM) và đưa vào luật / AI — đề xuất chưa xác nhận không bao giờ được dùng.
import { SYMPTOMS } from '../pages/admin/ai/catalog'
import { extractCase } from '../pages/admin/ai/ruleEngine'
import { getState as getAIConfig } from './aiConfigStore'

export const STATES = [
  { key: 'PRESENT', label: 'Yes', short: 'Yes' },
  { key: 'ABSENT', label: 'No', short: 'No' },
  { key: 'UNKNOWN', label: 'Not sure', short: '?' }
]
export const SOURCES = { Form: 'Entered', Extracted: 'From description', Prompt: 'Asked (missing info)' }

// Danh mục triệu chứng đang dùng. Backend: GET danh mục SYMPTOM bản Active (knowledge_reader).
export const activeSymptoms = () => SYMPTOMS

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
