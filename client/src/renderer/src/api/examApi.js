// Lời gọi API kết thúc khám của bác sĩ (chỉ dùng khi tắt giả lập): chẩn đoán, đơn thuốc, xác nhận đơn.
// Server: server/app/routers/prescription_router.py. Thứ tự khi chốt: đồng bộ chẩn đoán → lưu đơn nháp → xác nhận
// (trừ kho FEFO, lượt khám -> Prescribed, lập hóa đơn Pending). Không kê thuốc → "Hoàn tất khám".
import { apiGet, apiPost, apiRequest, ApiError } from './client'

const V1 = '/api/v1'

export const listDiagnoses = (visitId) => apiGet(`${V1}/visits/${visitId}/diagnoses`)
export const addDiagnosis = (visitId, body) => apiPost(`${V1}/visits/${visitId}/diagnoses`, body)
export const updateDiagnosis = (id, body) => apiRequest(`${V1}/diagnoses/${id}`, 'PATCH', body)
export const retractDiagnosis = (id) => apiPost(`${V1}/diagnoses/${id}/retract`, {})

export async function getPrescription(visitId) {
  try {
    return await apiGet(`${V1}/visits/${visitId}/prescription`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}
export const savePrescription = (visitId, items) => apiRequest(`${V1}/visits/${visitId}/prescription`, 'PUT', { items })
export const discardPrescription = (visitId) => apiRequest(`${V1}/visits/${visitId}/prescription`, 'DELETE')
export const confirmPrescription = (visitId) => apiPost(`${V1}/visits/${visitId}/prescription/confirm`, {})
export const completeExam = (visitId) => apiPost(`${V1}/visits/${visitId}/complete-exam`, {})
export const reopenPrescription = (visitId, reason) => apiPost(`${V1}/visits/${visitId}/prescription/reopen`, { reason })

// "J03.9 — Viêm amidan cấp" → { icd: 'J03.9', name: 'Viêm amidan cấp' }; chữ tự do → { icd: null, name }.
export function parseDiagnosis(text) {
  const t = String(text ?? '').trim()
  const m = t.match(/^([A-Z]\d{2}(?:\.[0-9A-Z]{1,4})?)\s*[—–-]\s*(.+)$/i)
  return m ? { icd: m[1].toUpperCase(), name: m[2].trim() } : { icd: null, name: t }
}
const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

// Đồng bộ danh sách chẩn đoán trên phiếu với server (chốt lại sau lần bị chặn vì thiếu thuốc không tạo trùng):
// giữ chẩn đoán đã có, rút lại chẩn đoán không còn trên phiếu, thêm chẩn đoán mới. Chẩn đoán chính thêm trước.
// candidates: gợi ý AI đang hiện (để gắn condition_code khi bác sĩ chọn đúng bệnh trong danh sách đang dùng).
export async function syncDiagnoses(visitId, { primary, extra, notes, candidates, assessmentId }) {
  const want = [{ ...parseDiagnosis(primary), primary: true, notes }, ...extra.map((x) => ({ ...parseDiagnosis(x), primary: false, notes: null }))].filter((x) => x.name)
  const have = (await listDiagnoses(visitId)).filter((x) => x.confirmed_by_physician)
  const match = (w) => have.find((h) => same(h.diagnosis_name, w.name) && (!w.icd || !h.icd10_code || same(h.icd10_code, w.icd)))
  for (const h of have) if (!want.some((w) => match(w) === h)) await retractDiagnosis(h.diagnosis_id)
  for (const w of want) {
    const h = match(w)
    if (h) {
      const patch = {}
      if (w.primary && !h.is_primary) patch.is_primary = true
      if (w.primary && (notes ?? null) !== (h.clinical_notes ?? null)) patch.clinical_notes = notes ?? null
      if (Object.keys(patch).length) await updateDiagnosis(h.diagnosis_id, patch)
      continue
    }
    const cand = candidates.find((c) => (w.icd && same(c.icd10_code, w.icd)) || same(c.name_vi, w.name))
    await addDiagnosis(visitId, {
      ...(cand ? { condition_code: cand.condition_code } : {}),
      diagnosis_name: w.name,
      icd10_code: w.icd,
      is_primary: w.primary,
      clinical_notes: w.notes || null,
      ...(assessmentId ? { assessment_id: assessmentId } : {})
    })
  }
}

// 409 STOCK_SHORTAGE: details [{ drug_id, needed, available_for_course, available_total, reason }] → dạng banner hiện có.
export const shortageOf = (e, lines) =>
  (e.details ?? []).map((x) => {
    const l = lines.find((y) => y.drugId === x.drug_id)
    return {
      key: x.item_id ?? x.drug_id,
      name: l?.name ?? x.drug_id,
      reason: x.reason === 'EXPIRES_BEFORE_COURSE_END' ? 'expiring' : 'out',
      need: x.needed,
      usable: x.available_for_course
    }
  })
