// Xử lý lỗi API tập trung. ApiError (api/client.js) mang status, code, details từ server.

// 409 do dữ liệu trên máy đã cũ: người khác vừa đổi trạng thái lượt khám / hoá đơn trước mình.
// Server trả details[0] = { field: 'status', current, allowed_from } cho xung đột chuyển trạng thái.
const STALE_CODES = new Set(['INVALID_TRANSITION', 'VISIT_TAKEN', 'CALLED_BY_OTHER', 'NOT_CALLED', 'VISIT_LOCKED'])
export const STALE_MESSAGE = 'Someone else just updated this — the list has been refreshed, please check and try again.'

export function isStaleConflict(e) {
  if (e?.status !== 409) return false
  if (STALE_CODES.has(e.code)) return true
  return Array.isArray(e.details) && e.details.some((d) => d?.field === 'status' && 'current' in d)
}

function isNetworkError(e) {
  // fetch thất bại (server tắt / mất mạng) ném TypeError; quá giờ đã có ApiError TIMEOUT kèm câu riêng.
  return e?.name === 'TypeError'
}

// Câu hiển thị cho người dùng: ưu tiên câu của server, xung đột dữ liệu cũ dùng câu chung kèm câu server nếu có.
export function errorMessage(e, fallback = 'Something went wrong. Please try again.') {
  if (!e) return fallback
  if (typeof e === 'string') return e
  if (isStaleConflict(e)) return e.message && !/^HTTP \d+$/.test(e.message) ? `${e.message} ${STALE_MESSAGE}` : STALE_MESSAGE
  if (isNetworkError(e)) return 'Cannot reach the server. Check the connection and try again.'
  return e.message && !/^HTTP \d+$/.test(e.message) ? e.message : fallback
}

// Kết quả chuẩn của action: { ok:false, error, code, stale }. Lỗi dữ liệu cũ thì gọi resync (đồng bộ lại danh sách).
export function failure(e, { resync, fallback } = {}) {
  const stale = isStaleConflict(e)
  if (resync && (stale || e?.status === 409)) resync()
  // Chỉ thêm stale khi có — giữ nguyên dạng { ok, error } cũ cho chỗ gọi và test.
  return stale ? { ok: false, error: errorMessage(e, fallback), stale: true } : { ok: false, error: errorMessage(e, fallback) }
}
