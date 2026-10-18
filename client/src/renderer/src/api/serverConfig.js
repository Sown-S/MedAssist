// Cấu hình riêng của MÁY NÀY: địa chỉ server phòng khám + nơi giữ token đăng nhập.
//  - Địa chỉ server đổi được lúc chạy (màn đăng nhập / Cài đặt › Kết nối), lưu ở userData qua preload — không phải build lại
//    như VITE_API_BASE_URL (Architecture 5.1.1: "server address is configurable in the client settings").
//  - Token (access 15 phút + refresh 8 giờ) lưu mã hoá bằng safeStorage của hệ điều hành qua window.api.secureStore (TC03).
//    Chạy ngoài Electron (trình duyệt khi dev) thì tạm giữ trong sessionStorage — tắt cửa sổ là mất, không ghi xuống đĩa.

// Mặc định: máy dev chạy uvicorn tại http://localhost:8000; bản đóng gói phải dùng HTTPS qua Caddy (TC03).
const DEFAULT_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : 'https://localhost')
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const desktop = typeof window !== 'undefined' && window.api?.config

let baseUrl = DEFAULT_URL
const listeners = new Set()

// Gọi một lần lúc khởi động (main.jsx), trước khi dựng giao diện.
export async function loadServerConfig() {
  try {
    const cfg = desktop ? await window.api.config.get() : JSON.parse(localStorage.getItem('medassist_server') ?? '{}')
    if (cfg?.serverUrl) baseUrl = cfg.serverUrl
  } catch {
    /* giữ địa chỉ mặc định */
  }
}

export const getBaseUrl = () => baseUrl
export const subscribeBaseUrl = (fn) => (listeners.add(fn), () => listeners.delete(fn))

// Chuẩn hoá và kiểm tra địa chỉ: http(s)://máy[:cổng], bỏ dấu / ở cuối.
export function normalizeUrl(input) {
  const s = String(input ?? '').trim().replace(/\/+$/, '')
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s)
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname) return null
    return u.origin
  } catch {
    return null
  }
}

export async function setBaseUrl(input) {
  const url = normalizeUrl(input)
  if (!url) return { ok: false, error: 'Enter a valid server address, e.g. https://192.168.1.10' }
  // Bản đóng gói: chỉ HTTPS tới máy chủ trong LAN (token không bao giờ đi qua http thường). http chỉ cho máy này (dev).
  const u = new URL(url)
  if (!import.meta.env.DEV && u.protocol === 'http:' && !LOCAL.has(u.hostname)) return { ok: false, error: 'Use https:// — the clinic server is only reachable over HTTPS.' }
  if (desktop) await window.api.config.set({ serverUrl: url })
  else localStorage.setItem('medassist_server', JSON.stringify({ serverUrl: url }))
  baseUrl = url
  listeners.forEach((fn) => fn())
  return { ok: true, url }
}

// ---------- Token đăng nhập ----------
const secure = typeof window !== 'undefined' && window.api?.secureStore
export const tokenStore = {
  get: (kind) => (secure ? window.api.secureStore.get('token.' + kind) : Promise.resolve(sessionStorage.getItem('medassist_token.' + kind))),
  set: (kind, value) => (secure ? window.api.secureStore.set('token.' + kind, value) : Promise.resolve(sessionStorage.setItem('medassist_token.' + kind, value))),
  clear: async () => {
    for (const kind of ['access', 'refresh']) {
      if (secure) await window.api.secureStore.remove('token.' + kind)
      else sessionStorage.removeItem('medassist_token.' + kind)
    }
  }
}
