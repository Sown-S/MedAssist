// Hồ sơ bệnh án (FR04): lịch sử khám và chi tiết từng lượt. Chỉ Bác sĩ, Y tá xem; mỗi lần xem server ghi nhật ký VIEW.
import { apiGet } from './client'

const V1 = '/api/v1'

export const getHistory = (patientId, { limit = 20, offset = 0, includeCancelled = false } = {}) =>
  apiGet(`${V1}/patients/${patientId}/history?limit=${limit}&offset=${offset}&include_cancelled=${includeCancelled}`)

// Đủ một lượt: sinh hiệu, lời kể, chẩn đoán (kể cả đã rút lại), ghi chú lâm sàng, đơn thuốc, hoá đơn.
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
