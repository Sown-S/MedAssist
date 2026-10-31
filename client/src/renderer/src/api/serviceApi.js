// Danh mục dịch vụ, xét nghiệm, gói khám và phiếu chỉ định cận lâm sàng trên server (ERD v2.1).
// Chỉ dùng khi tắt giả lập. Hóa đơn tự có dòng cận lâm sàng từ chỉ định; GET hóa đơn trả thêm
// unbilled_items = chỉ định ngoài danh mục chưa có giá, quầy thêm tay.
import { apiGet, apiPost, apiRequest } from './client'

const V1 = '/api/v1'
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()

// ---------- Danh mục (đọc: mọi vai trò; sửa: Admin) ----------
// kind: 'Service' (dịch vụ / thủ thuật) | 'Lab' (xét nghiệm / chẩn đoán hình ảnh)
export const fetchServices = ({ kind, q, includeInactive = false } = {}) =>
  apiGet(`${V1}/services?${qs({ kind, q, include_inactive: includeInactive || undefined })}`)
// body: { code, name, kind, group_key, unit?, price, ref_low?, ref_high?, ref_text?, sample? } — không đổi được code, kind
export const createService = (body) => apiPost(`${V1}/admin/services`, body)
export const updateService = (serviceId, fields) => apiRequest(`${V1}/admin/services/${serviceId}`, 'PATCH', fields)
// [{ price, old_price, changed_at, changed_by_name }], mới nhất trước
export const fetchPriceHistory = (serviceId) => apiGet(`${V1}/admin/services/${serviceId}/price-history`)

// items: [{ service_id, quantity }]
export const fetchPackages = (includeInactive = false) => apiGet(`${V1}/service-packages?${qs({ include_inactive: includeInactive || undefined })}`)
export const createPackage = (body) => apiPost(`${V1}/admin/service-packages`, body)
export const updatePackage = (packageId, fields) => apiRequest(`${V1}/admin/service-packages/${packageId}`, 'PATCH', fields)

// ---------- Phiếu chỉ định (bác sĩ đang khám lượt đó) ----------
// order: { service_ids: [], package_id?, other_items: ['Siêu âm ...'], diagnosis?, note?, send_out = true }
// send_out = true: server đánh dấu luôn bệnh nhân đi xét nghiệm (không cần gọi lab-out riêng).
export const createServiceOrder = (visitId, order) => apiPost(`${V1}/visits/${visitId}/service-orders`, order)
export const fetchServiceOrders = (visitId) => apiGet(`${V1}/visits/${visitId}/service-orders`)
// items: [{ item_id, result }], conclusions: [{ order_id, conclusion }] — chuỗi rỗng = xoá
export const putServiceResults = (visitId, items = [], conclusions = []) =>
  apiRequest(`${V1}/visits/${visitId}/service-orders/results`, 'PUT', { items, conclusions })
// Bác sĩ: lượt đang khám. Lễ tân: lượt chờ thu tiền (hoá đơn tự lập lại). 409 ORDER_ITEM_HAS_RESULT nếu đã có kết quả.
export const cancelServiceOrderItem = (itemId, reason) => apiPost(`${V1}/service-order-items/${itemId}/cancel`, { reason })
