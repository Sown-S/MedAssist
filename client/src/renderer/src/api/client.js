import { getBaseUrl, tokenStore } from './serverConfig'

// Địa chỉ server lấy từ serverConfig; token giữ trong kho mã hoá của hệ điều hành.

// Lỗi theo định dạng chung của backend: { error: { code, message, details, request_id } }. Giao diện rẽ nhánh theo code;
// message (tiếng Việt) làm dự phòng; details[].field để đánh dấu ô sai.
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

// Mỗi lần gọi server chờ tối đa 45 giây (server treo / mạng chập chờn thì nút không quay mãi). Quá 10 giây thì bật cờ
// "đang chậm" để giao diện báo người dùng là app vẫn đang chờ, không treo. Tải file (xuất nhật ký) gọi fetch riêng, không
// áp giới hạn này.
const REQUEST_TIMEOUT_MS = 45000
const SLOW_AFTER_MS = 10000
let slowCount = 0
const slowSubs = new Set()
const bumpSlow = (d) => ((slowCount += d), slowSubs.forEach((f) => f()))
export const subscribeSlow = (f) => (slowSubs.add(f), () => slowSubs.delete(f))
export const isServerSlow = () => slowCount > 0
export const TIMEOUT_MESSAGE = 'The server did not respond within 45 seconds — check the connection and try again.'

export async function timedFetch(url, init = {}) {
  const ctrl = new AbortController()
  let timedOut = false
  let slow = false
  const stop = setTimeout(() => ((timedOut = true), ctrl.abort()), REQUEST_TIMEOUT_MS)
  const warn = setTimeout(() => ((slow = true), bumpSlow(1)), SLOW_AFTER_MS)
  // Bên gọi tự huỷ (signal riêng) vẫn được tôn trọng.
  const outer = init.signal
  const relay = () => ctrl.abort()
  if (outer?.aborted) ctrl.abort()
  else outer?.addEventListener('abort', relay, { once: true })
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    if (timedOut) throw new ApiError(0, { error: { code: 'TIMEOUT', message: TIMEOUT_MESSAGE } })
    throw e
  } finally {
    clearTimeout(stop)
    clearTimeout(warn)
    outer?.removeEventListener('abort', relay)
    if (slow) bumpSlow(-1)
  }
}

// 401 do access token hết hạn → đổi bằng refresh token một lần rồi gọi lại; refresh cũng 401 → về màn đăng nhập.
let onSessionExpired = () => {}
export const setSessionExpiredHandler = (fn) => (onSessionExpired = fn)
// 403 PASSWORD_CHANGE_REQUIRED (VD admin vừa đặt lại mật khẩu) → về màn đổi mật khẩu.
let onPasswordChangeRequired = () => {}
export const setPasswordChangeRequiredHandler = (fn) => (onPasswordChangeRequired = fn)
let refreshing = null
async function refreshTokens() {
  const refresh = await tokenStore.get('refresh')
  if (!refresh) return false
  const res = await timedFetch(getBaseUrl() + '/api/v1/auth/refresh', {
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
  const res = await timedFetch(getBaseUrl() + path, {
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

export const apiGet = (path) => realRequest(path)
export const apiPost = (path, body) => realRequest(path, { method: 'POST', body: JSON.stringify(body) })
export function apiRequest(path, method, body) {
  return realRequest(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
}

// GET /health: đọc được cả dạng { database: 'connected' } lẫn { database: { ok, detail }, ai, version }; mục server
// không báo → ok = null.
export async function checkHealth() {
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
      checkedAt: new Date().toISOString(),
      services: [
        { key: 'api', name: 'API server', ok: false, state: 'No connection', detail: `${getBaseUrl()} · ${e.name === 'TimeoutError' ? 'timed out after 5 s' : e.message}` },
        { key: 'db', name: 'Database', ok: false, state: 'Unknown', detail: '' },
        { key: 'ai', name: 'AI service', ok: false, state: 'Unknown', detail: '' }
      ]
    }
  }
}
