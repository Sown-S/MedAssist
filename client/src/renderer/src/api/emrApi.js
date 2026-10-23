// Hồ sơ bệnh án điện tử (FR04, US04) với backend thật: lịch sử khám và chi tiết từng lượt. Chỉ Bác sĩ, Y tá xem;
// mỗi lần xem server ghi nhật ký VIEW. Server: clinic_router.py (/patients/{id}/history, /visits/{id}/record).
import { apiGet } from './client'

const V1 = '/api/v1'

// { patient: { patient_code, full_name, ..., medical_history, allergy_notes }, total, items: [lượt khám mới nhất trước] }
export const getHistory = (patientId, { limit = 20, offset = 0, includeCancelled = false } = {}) =>
  apiGet(`${V1}/patients/${patientId}/history?limit=${limit}&offset=${offset}&include_cancelled=${includeCancelled}`)

// Đầy đủ một lượt: sinh hiệu, lời kể, chẩn đoán (kể cả đã rút lại), ghi chú lâm sàng, đơn thuốc, hóa đơn.
export const getVisitRecord = (visitId) => apiGet(`${V1}/visits/${visitId}/record`)

export const VISIT_STATUS_LABEL = {
  Waiting: 'Waiting',
  CheckedIn: 'Checked in',
  Examining: 'In consultation',
  Prescribed: 'Awaiting payment',
  Finished: 'Completed',
  Cancelled: 'Cancelled'
}
export const PRIORITY_LABEL = { Emergency: 'Emergency', HighPriority: 'High priority', Routine: 'Routine' }
