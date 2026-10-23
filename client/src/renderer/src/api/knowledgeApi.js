// Lời gọi API quản trị tri thức (chỉ dùng khi tắt giả lập — xem DEMO_MODE trong client.js).
// Server: server/app/routers/knowledge_router.py — tiền tố /api/v1/admin/knowledge.
// Admin soạn nháp trong MỘT bản phát hành đang mở, gửi duyệt; Bác sĩ (khác người soạn) duyệt hoặc từ chối cả bản.
// Admin tắt khẩn cấp một mục Active (không cần duyệt), kèm các mục phụ thuộc bị tắt theo.
import { apiGet, apiPost, apiRequest } from './client'

const BASE = '/api/v1/admin/knowledge'

// Thứ tự giống server (khóa trước, quan hệ sau).
export const KINDS = ['symptoms', 'conditions', 'relations', 'excerpts', 'rules']
export const OPEN_STATUSES = ['Draft', 'PendingApproval']

// Mã OKF (Quy định v5): slug chữ thường không dấu, số, gạch dưới giữa các từ.
export const SLUG_RE = /^[a-z0-9]+(_[a-z0-9]+)*$/
export const KEY_MAX = { symptoms: 50, conditions: 80, excerpts: 80, rules: 80 }
export const RULE_PREFIX = { RED_FLAG: 'rf_', PRIORITY_FLOOR: 'pf_' }

// Khóa có dấu "/" (quan hệ: <condition_code>/<symptom_code>) — mã hóa từng phần, giữ dấu "/".
const keyPath = (key) => key.split('/').map(encodeURIComponent).join('/')

// ---------- Bản phát hành ----------
export const listReleases = () => apiGet(`${BASE}/releases`)
export const getRelease = (id) => apiGet(`${BASE}/releases/${id}`)
export const createRelease = (label, description) => apiPost(`${BASE}/releases`, { label, description: description || null })
export const submitRelease = (id) => apiPost(`${BASE}/releases/${id}/submit`, {})
export const approveRelease = (id) => apiPost(`${BASE}/releases/${id}/approve`, {})
export const rejectRelease = (id, note) => apiPost(`${BASE}/releases/${id}/reject`, { note })

// ---------- Nguồn ----------
export const listSources = () => apiGet(`${BASE}/sources`)
export const createSource = (body) => apiPost(`${BASE}/sources`, body)

// ---------- Mục tri thức ----------
// Tải hết một loại (mọi trạng thái); server giới hạn 200 dòng mỗi trang.
export async function listAll(kind) {
  const out = []
  for (let offset = 0; ; offset += 200) {
    const page = await apiGet(`${BASE}/${kind}?limit=200&offset=${offset}`)
    out.push(...page.items)
    if (out.length >= page.total || !page.items.length) return out
  }
}
export const itemVersions = (kind, key) => apiGet(`${BASE}/${kind}/${keyPath(key)}/versions`)

// Soạn nháp: tạo mới hoặc sửa (server tạo phiên bản kế tiếp trong bản phát hành đang mở).
export function putDraft(kind, key, body) {
  const path = kind === 'relations' ? `relations/${keyPath(key)}` : `${kind}/${encodeURIComponent(key)}`
  return apiRequest(`${BASE}/${path}`, 'PUT', body)
}
export const dropDraft = (kind, key) => apiRequest(`${BASE}/${kind}/${keyPath(key)}/draft`, 'DELETE')

// Tắt khẩn cấp: xem trước mục phụ thuộc, rồi gửi lại đúng danh sách đó (lệch thì server từ chối DEPENDENTS_CHANGED).
export const previewDeactivate = (kind, key) => apiGet(`${BASE}/${kind}/${keyPath(key)}/dependents`)
export const deactivate = (kind, key, reason, dependents) =>
  apiPost(`${BASE}/${kind}/${keyPath(key)}/deactivate`, { reason, confirm_dependents: dependents })
