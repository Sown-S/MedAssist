import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import { translate } from '../i18n'

// Hộp thoại theo bản mẫu: .ov > .modal (sm | lg | xl) > .modal-h + .modal-b + .modal-f.
// Đóng bằng nút X (ModalHeader), nút Hủy của từng modal hoặc phím Esc (= bấm nút X của hộp trên cùng). Bấm nhầm ra vùng
// mờ không đóng để không mất dữ liệu đang nhập; đang gõ trong ô nhập thì Esc lần đầu chỉ rời ô, Esc lần nữa mới đóng.
// onClose giữ lại trong props để các nơi gọi không phải đổi; Modal tự nó không gọi.
// wide: true → lg, 'xl' → xl; size: 'sm' cho hộp xác nhận ngắn.
const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

export default function Modal({ open, wide, size, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !ref.current) return
      // Chỉ hộp thoại trên cùng xử lý.
      if ([...document.querySelectorAll('.ov.show .modal')].pop() !== ref.current) return
      e.preventDefault()
      const el = document.activeElement
      if (typing(el) && ref.current.contains(el) && el.type !== 'checkbox' && el.type !== 'radio') return el.blur()
      ref.current.querySelector('.modal-close')?.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null
  const w = size ?? (wide === 'xl' ? 'xl' : wide ? 'lg' : '')
  // Portal ra <body>: phần tử cha có backdrop-filter sẽ “nhốt” position: fixed bên trong nó.
  return createPortal(
    <div className="ov show">
      <div ref={ref} className={'modal' + (w ? ' ' + w : '')} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    document.body
  )
}

export function ModalHeader({ title, onClose }) {
  return (
    <div className="modal-h">
      <h3>{title}</h3>
      <button className="btn btn-ghost btn-icon modal-close" onClick={onClose} title={translate('Close')} aria-label={translate('Close')}>
        <Icon name="x" />
      </button>
    </div>
  )
}

// Chân hộp thoại chỉ có nút Đóng (hộp xem thông tin, không có thao tác lưu).
export function ModalCloseFooter({ onClose, children }) {
  return (
    <div className="modal-f">
      {children}
      <span className="sp" />
      <button className="btn btn-outline" onClick={onClose}>
        {translate('Close')}
      </button>
    </div>
  )
}
