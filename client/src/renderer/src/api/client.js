import { MOCK_ENDPOINTS } from './mockData'
import { getBaseUrl, tokenStore } from './serverConfig'

// BẬT/TẮT: mặc định chạy giả lập (không cần server). Dùng backend FastAPI thật: đặt VITE_USE_MOCK=false trong client/.env
// (file riêng của máy, không commit) rồi chạy lại npm run dev — KHÔNG cần sửa trang nào đang gọi apiGet()/apiPost().
// Địa chỉ server lấy từ serverConfig (đổi được lúc chạy), token lấy từ kho mã hoá của hệ điều hành.
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Giả lập độ trễ mạng 300-600ms để UI (loading spinner, skeleton...) được viết đúng ngay từ đầu,
// thay vì tưởng nhầm là mọi thứ luôn "tức thì" rồi bị bất ngờ khi ghép API thật.
async function mockRequest(path) {
  await delay(300 + Math.random() * 300)
  const handler = MOCK_ENDPOINTS[path.split('?')[0]]
  if (!handler) {
    throw new Error(`[mock] No mock endpoint for: ${path}`)
  }
  return handler()
}

// Lỗi API theo định dạng thống nhất của backend: { error: { code, message, details, request_id } }.
// Giao diện rẽ nhánh theo code (dịch theo ngôn ngữ đang chọn), message tiếng Việt của server dùng làm dự phòng;
// details[].field để tô đỏ đúng ô nhập; request_id hiện cho người dùng khi lỗi 500.
export class ApiError extends Error {
  constructor(status, body) {
    const e = body?.error ?? {}
    super(e.message || `HTTP ${status}`)
    this.status = status
    this.code = e.code || (status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR')
    this.details = e.details ?? []
    this.requestId = e.request_id ?? null
  }
}

// Gặp 401 vì access token hết hạn → đổi bằng refresh token một lần rồi gọi lại; refresh cũng 401 → về màn đăng nhập.
let onSessionExpired = () => {}
export const setSessionExpiredHandler = (fn) => (onSessionExpired = fn)
// 403 PASSWORD_CHANGE_REQUIRED: tài khoản đang bị bắt đổi mật khẩu (vd admin vừa đặt lại) → về màn đổi mật khẩu.
let onPasswordChangeRequired = () => {}
export const setPasswordChangeRequiredHandler = (fn) => (onPasswordChangeRequired = fn)
let refreshing = null
async function refreshTokens() {
  const refresh = await tokenStore.get('refresh')
  if (!refresh) return false
  const res = await fetch(getBaseUrl() + '/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh })
  })
  if (!res.ok) return false
  const t = await res.json()
  await tokenStore.set('access', t.access_token)
  if (t.refresh_token) await tokenStore.set('refresh', t.refresh_token)
  return true
}

// Sai mật khẩu ở /auth/login cũng trả 401 — không được hiểu là token hết hạn.
const NO_REFRESH = ['/api/v1/auth/login', '/api/v1/auth/refresh']
async function realRequest(path, options = {}, retried = false) {
  const token = await tokenStore.get('access')
  const res = await fetch(getBaseUrl() + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  })
  if (res.status === 401 && !retried && !NO_REFRESH.includes(path)) {
    refreshing ??= refreshTokens().finally(() => (refreshing = null))
    if (await refreshing) return realRequest(path, options, true)
    await tokenStore.clear()
    onSessionExpired()
  }
  if (!res.ok) {
    const err = new ApiError(res.status, await res.json().catch(() => null))
    if (err.code === 'PASSWORD_CHANGE_REQUIRED') onPasswordChangeRequired()
    throw err
  }
  return res.status === 204 ? null : res.json()
}

export async function apiGet(path) {
  return USE_MOCK ? mockRequest(path) : realRequest(path)
}

export async function apiPost(path, body) {
  if (USE_MOCK) {
    await delay(300)
    // Mock POST: chỉ log ra, không lưu thật — đủ để demo luồng UI (toast "đã lưu"...).
    console.log('[mock POST]', path, body)
    return { ok: true }
  }
  return realRequest(path, { method: 'POST', body: JSON.stringify(body) })
}

// PATCH / PUT / DELETE — chỉ dùng khi đã tắt giả lập (các store giả lập tự xử lý dữ liệu cục bộ).
export function apiRequest(path, method, body) {
  if (USE_MOCK) return Promise.reject(new Error(`[mock] ${method} ${path} chỉ có khi dùng backend thật`))
  return realRequest(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
}

export const DEMO_MODE = USE_MOCK

// Kiểm tra kết nối: GET /health của FastAPI. Server hiện trả { status, database: 'connected' | 'unavailable' } (503 khi CSDL lỗi);
// dạng mở rộng { database: {ok, detail}, ai: {ok, detail}, version } cũng đọc được. Mục server không báo → ok = null (chưa rõ).
// Trang chủ (ô Trạng thái hệ thống) và Cài đặt › Kết nối dùng chung hàm này.
// Chế độ demo: không có server → trả về số liệu mẫu, đánh dấu sample = true để giao diện ghi rõ.
export async function checkHealth() {
  if (USE_MOCK) {
    await delay(300)
    return {
      sample: true,
      checkedAt: new Date().toISOString(),
      services: [
        { key: 'api', name: 'API server', ok: true, state: 'Connected', detail: 'FastAPI · 192.168.1.10:8000 · 12 ms' },
        { key: 'db', name: 'Database', ok: true, state: 'Connected', detail: 'PostgreSQL · 14 active connections' },
        { key: 'ai', name: 'AI service', ok: true, state: 'Running', detail: 'Ollama · model loaded' }
      ]
    }
  }
  const t0 = performance.now()
  try {
    const res = await fetch(getBaseUrl() + '/health', { signal: AbortSignal.timeout(5000) })
    const ms = Math.round(performance.now() - t0)
    const h = await res.json().catch(() => ({}))
    const svc = (key, name, x, up) => {
      if (x == null) return { key, name, ok: null, state: 'Not reported', detail: 'The server does not report this yet' }
      const ok = typeof x === 'string' ? x === 'connected' : !!x.ok
      return { key, name, ok, state: ok ? up : 'Unavailable', detail: typeof x === 'string' ? '' : x.detail ?? '' }
    }
    return {
      sample: false,
      checkedAt: new Date().toISOString(),
      serverVersion: h.version,
      services: [
        { key: 'api', name: 'API server', ok: res.ok, state: res.ok ? 'Connected' : `HTTP ${res.status}`, detail: `${getBaseUrl()} · ${ms} ms` },
        svc('db', 'Database', h.database, 'Connected'),
        svc('ai', 'AI service', h.ai, 'Running')
      ]
    }
  } catch (e) {
    return {
      sample: false,
      checkedAt: new Date().toISOString(),
      services: [
        { key: 'api', name: 'API server', ok: false, state: 'No connection', detail: `${getBaseUrl()} · ${e.name === 'TimeoutError' ? 'timed out after 5 s' : e.message}` },
        { key: 'db', name: 'Database', ok: false, state: 'Unknown', detail: '' },
        { key: 'ai', name: 'AI service', ok: false, state: 'Unknown', detail: '' }
      ]
    }
  }
}
