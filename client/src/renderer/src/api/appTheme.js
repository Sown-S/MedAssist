// Tuỳ chọn giao diện riêng của máy này (không gửi lên server): chế độ màu, màu thanh menu (sidebarTheme.js),
// cỡ chữ và giảm chuyển động. Ghi lên <html> dưới dạng data-* để CSS đổi bộ biến màu / cỡ chữ.
const KEYS = { mode: 'medassist_color_mode', font: 'medassist_font_size', scale: 'medassist_ui_scale', motion: 'medassist_motion', accent: 'medassist_accent' }
// Màu chủ đạo của nút, liên kết, mục đang chọn: xanh dương (mặc định) hoặc xanh lá (kiểu bệnh viện).
export const ACCENTS = [
  { key: 'blue', label: 'Blue', color: '#1877F2' },
  { key: 'green', label: 'Green', color: '#0E9F55' }
]
export const COLOR_MODES = [
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
  { key: 'system', label: 'Match Windows', icon: 'monitor' }
]
// Cỡ chữ = thu phóng cả giao diện (chữ, ô, icon, khoảng cách cùng tỉ lệ) để bố cục không vỡ ở cỡ lớn.
export const UI_SCALES = [0.9, 1, 1.1, 1.2, 1.3]

const read = (k, ok, d) => {
  try {
    const v = localStorage.getItem(KEYS[k])
    return ok.includes(v) ? v : d
  } catch {
    return d
  }
}
const write = (k, v) => {
  try {
    localStorage.setItem(KEYS[k], v)
  } catch {
    /* máy chặn lưu cục bộ: vẫn đổi ngay, chỉ không nhớ sau khi mở lại */
  }
}

export const getColorMode = () => read('mode', ['light', 'dark', 'system'], 'light')
export function getUiScale() {
  try {
    const v = Number(localStorage.getItem(KEYS.scale))
    if (UI_SCALES.includes(v)) return v
    // Lựa chọn cũ (Nhỏ / Vừa / Lớn) của bản trước.
    return { sm: 0.9, lg: 1.1 }[localStorage.getItem(KEYS.font)] ?? 1
  } catch {
    return 1
  }
}
export const getAccent = () => read('accent', ['blue', 'green'], 'blue')
export const getReduceMotion = () => read('motion', ['reduce', 'auto'], 'auto') === 'reduce'

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
const resolve = (mode) => (mode === 'system' ? (media?.matches ? 'dark' : 'light') : mode)

export function applyAppearance() {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.dataset.theme = resolve(getColorMode())
  const scale = getUiScale()
  if (window.api?.view) window.api.view.setZoom(scale)
  else el.style.zoom = scale === 1 ? '' : String(scale)
  el.dataset.accent = getAccent()
  if (getReduceMotion()) el.dataset.motion = 'reduce'
  else delete el.dataset.motion
}
media?.addEventListener?.('change', () => getColorMode() === 'system' && applyAppearance())

export function setColorMode(v) {
  write('mode', v)
  applyAppearance()
}
export function setUiScale(v) {
  write('scale', String(v))
  applyAppearance()
}
export function setAccent(v) {
  write('accent', v)
  applyAppearance()
}
export function setReduceMotion(on) {
  write('motion', on ? 'reduce' : 'auto')
  applyAppearance()
}
