import { useEffect } from 'react'
import '../src/renderer/src/global.css'

// Mọi truyện chạy trong khung giống app: CSS chung, giao diện sáng/tối theo nút theme của Ladle, màu phòng khám qua
// tham số ?accent= (default | blue | teal | sunset).
export const Provider = ({ children, globalState }) => {
  useEffect(() => {
    const h = document.documentElement
    h.dataset.theme = globalState.theme === 'dark' ? 'dark' : 'light'
    h.dataset.accent = new URLSearchParams(location.search).get('accent') ?? 'default'
    h.dataset.motion = 'reduce'
  }, [globalState.theme])
  return <div style={{ padding: 24, background: 'var(--bg)', minHeight: '100vh', color: 'var(--ink)' }}>{children}</div>
}
