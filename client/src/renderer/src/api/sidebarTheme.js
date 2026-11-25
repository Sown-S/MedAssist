// Màu thanh menu bên trái (Sáng / Tối) — cài đặt riêng của máy này, không gửi lên server.
const KEY = 'medassist_sidebar_theme'

export const SIDEBAR_THEMES = [
  { key: 'light', label: 'Light', bg: '#FFFFFF', ink: '#3E4C57', active: '#E7F0FD' },
  { key: 'dark', label: 'Dark', bg: '#0F1B2D', ink: '#C3CED8', active: '#1877F2' }
]

export function getSidebarTheme() {
  try {
    const v = localStorage.getItem(KEY)
    return SIDEBAR_THEMES.some((t) => t.key === v) ? v : 'light'
  } catch {
    return 'light'
  }
}

export function applySidebarTheme(key = getSidebarTheme()) {
  if (typeof document !== 'undefined') document.documentElement.dataset.sidebar = key
}

export function setSidebarTheme(key) {
  try {
    localStorage.setItem(KEY, key)
  } catch {
    /* máy chặn lưu cục bộ: vẫn đổi ngay, chỉ không nhớ sau khi mở lại */
  }
  applySidebarTheme(key)
}
