import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Popup cảnh báo gắn ngay dưới nút chuông trên thanh trên cùng (giống bản mẫu: .bell-pop nằm trong .tb của chuông).
// Trang nào cần popup thì bọc nội dung trong <BellPortal>; chưa có chuông (đang dựng khung) thì chưa hiện.
export default function BellPortal({ children }) {
  const [host, setHost] = useState(null)
  useEffect(() => setHost(document.querySelector('.top .tb.bell')), [])
  return host ? createPortal(<div className="bell-stack">{children}</div>, host) : null
}
