// Nhật ký hoạt động trên server (chỉ Admin, chỉ dùng khi tắt giả lập): GET /api/v1/admin/audit-logs (+ /export).
// Nhật ký chỉ-thêm, CSDL chặn sửa / xoá. Xem và xuất đều được server ghi lại (VIEW / EXPORT).
import { apiGet, ApiError } from './client'
import { getBaseUrl, tokenStore } from './serverConfig'

const BASE = '/api/v1/admin/audit-logs'
export const ACTION_TYPES = ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'APPROVE', 'REJECT', 'RETIRE', 'AI_ASSESSMENT']
// Nhãn và màu của từng loại hành động — dùng chung cho trang Lịch sử hoạt động và trang chủ Quản trị.
export const ACTION_LABEL = {
  LOGIN: 'Sign-in',
  LOGIN_FAILED: 'Failed sign-in',
  LOGOUT: 'Sign-out',
  VIEW: 'Viewed',
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  EXPORT: 'Exported',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  RETIRE: 'Turned off',
  AI_ASSESSMENT: 'AI assessment'
}
export const ACTION_TONE = { LOGIN_FAILED: 'low', DELETE: 'low', RETIRE: 'warn', REJECT: 'warn', APPROVE: 'ok', EXPORT: 'info', AI_ASSESSMENT: 'info' }

// filters: { username, action_type, target_entity, from, to } — from / to là ngày yyyy-mm-dd (giờ Việt Nam).
function query(filters, extra = {}) {
  const p = new URLSearchParams()
  if (filters.username?.trim()) p.set('username', filters.username.trim())
  if (filters.action_type) p.set('action_type', filters.action_type)
  if (filters.target_entity?.trim()) p.set('target_entity', filters.target_entity.trim())
  if (filters.from) p.set('created_from', `${filters.from}T00:00:00+07:00`)
  if (filters.to) p.set('created_to', `${filters.to}T23:59:59+07:00`)
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  return p.toString()
}

export const listAuditLogs = (filters, limit, offset) => apiGet(`${BASE}?${query(filters, { limit, offset })}`)

// Xuất .xlsx (mặc định) hoặc .csv: tải dạng nhị phân (không đọc thành chữ, giữ BOM của CSV), lưu bằng tên server đặt.
// Trả { truncated } — server cắt ở 50.000 dòng và báo qua header X-Export-Truncated.
export async function exportAuditLogs(filters, format = 'xlsx') {
  const token = await tokenStore.get('access')
  const res = await fetch(getBaseUrl() + `${BASE}/export?${query(filters, { format })}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null))
  const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `audit_log.${format}`
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { truncated: res.headers.get('X-Export-Truncated') }
}
