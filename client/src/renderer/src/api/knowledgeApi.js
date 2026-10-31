// Quản trị tri thức (/admin/knowledge). Admin soạn nháp trong một bản phát hành đang mở rồi gửi duyệt; bác sĩ khác
// người soạn duyệt hoặc từ chối cả bản. Tắt khẩn cấp một mục không cần duyệt, các mục phụ thuộc bị tắt theo.
import { apiGet, apiPost, apiRequest } from './client'

const BASE = '/api/v1/admin/knowledge'

// Thứ tự giống server: khoá trước, quan hệ sau.
export const KINDS = ['symptoms', 'conditions', 'relations', 'excerpts', 'rules']
export const OPEN_STATUSES = ['Draft', 'PendingApproval']

// Mã OKF: slug chữ thường không dấu, số, gạch dưới giữa các từ.
export const SLUG_RE = /^[a-z0-9]+(_[a-z0-9]+)*$/
export const KEY_MAX = { symptoms: 50, conditions: 80, excerpts: 80, rules: 80 }
export const RULE_PREFIX = { RED_FLAG: 'rf_', PRIORITY_FLOOR: 'pf_' }

// Khoá quan hệ dạng <condition_code>/<symptom_code>: mã hoá từng phần, giữ dấu “/”.
const keyPath = (key) => key.split('/').map(encodeURIComponent).join('/')

export const listReleases = () => apiGet(`${BASE}/releases`)
export const getRelease = (id) => apiGet(`${BASE}/releases/${id}`)
export const createRelease = (label, description) => apiPost(`${BASE}/releases`, { label, description: description || null })
export const submitRelease = (id) => apiPost(`${BASE}/releases/${id}/submit`, {})
export const approveRelease = (id) => apiPost(`${BASE}/releases/${id}/approve`, {})
export const rejectRelease = (id, note) => apiPost(`${BASE}/releases/${id}/reject`, { note })

export const listSources = () => apiGet(`${BASE}/sources`)
export const createSource = (body) => apiPost(`${BASE}/sources`, body)

// Server giới hạn 200 dòng mỗi trang → tải hết một loại.
export async function listAll(kind) {
  const out = []
  for (let offset = 0; ; offset += 200) {
    const page = await apiGet(`${BASE}/${kind}?limit=200&offset=${offset}`)
    out.push(...page.items)
    if (out.length >= page.total || !page.items.length) return out
  }
}
export const itemVersions = (kind, key) => apiGet(`${BASE}/${kind}/${keyPath(key)}/versions`)

// Server tạo phiên bản kế tiếp trong bản phát hành đang mở.
export function putDraft(kind, key, body) {
  const path = kind === 'relations' ? `relations/${keyPath(key)}` : `${kind}/${encodeURIComponent(key)}`
  return apiRequest(`${BASE}/${path}`, 'PUT', body)
}
export const dropDraft = (kind, key) => apiRequest(`${BASE}/${kind}/${keyPath(key)}/draft`, 'DELETE')

// Xem trước mục phụ thuộc rồi gửi lại đúng danh sách đó; lệch thì server từ chối DEPENDENTS_CHANGED.
export const previewDeactivate = (kind, key) => apiGet(`${BASE}/${kind}/${keyPath(key)}/dependents`)
export const deactivate = (kind, key, reason, dependents) =>
  apiPost(`${BASE}/${kind}/${keyPath(key)}/deactivate`, { reason, confirm_dependents: dependents })
