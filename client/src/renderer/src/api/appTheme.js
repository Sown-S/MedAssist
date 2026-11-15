// Tuỳ chọn giao diện riêng của máy này (không gửi lên server): chế độ màu, màu thanh menu (sidebarTheme.js),
// cỡ chữ và giảm chuyển động. Ghi lên <html> dưới dạng data-* để CSS đổi bộ biến màu / cỡ chữ.
const KEYS = { mode: 'medassist_color_mode', font: 'medassist_font_size', motion: 'medassist_motion' }
export const COLOR_MODES = [
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
  { key: 'system', label: 'Match Windows', icon: 'monitor' }
]
export const FONT_SIZES = [
  { key: 'sm', label: 'Small' },
  { key: 'md', label: 'Standard' },
  { key: 'lg', label: 'Large' }
]

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
export const getFontSize = () => read('font', ['sm', 'md', 'lg'], 'md')
export const getReduceMotion = () => read('motion', ['reduce', 'auto'], 'auto') === 'reduce'

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
const resolve = (mode) => (mode === 'system' ? (media?.matches ? 'dark' : 'light') : mode)

export function applyAppearance() {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.dataset.theme = resolve(getColorMode())
  el.dataset.font = getFontSize()
  if (getReduceMotion()) el.dataset.motion = 'reduce'
  else delete el.dataset.motion
}
media?.addEventListener?.('change', () => getColorMode() === 'system' && applyAppearance())

export function setColorMode(v) {
  write('mode', v)
  applyAppearance()
}
export function setFontSize(v) {
  write('font', v)
  applyAppearance()
}
export function setReduceMotion(on) {
  write('motion', on ? 'reduce' : 'auto')
  applyAppearance()
}
