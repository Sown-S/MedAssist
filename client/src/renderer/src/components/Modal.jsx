import { createPortal } from 'react-dom'
import Icon from './Icon'
import { translate } from '../i18n'

// Hộp thoại theo bản mẫu: .ov > .modal (sm | lg | xl) > .modal-h + .modal-b + .modal-f.
// Chỉ đóng bằng nút X (ModalHeader) hoặc nút Hủy của từng modal: bấm nhầm ra vùng mờ không được làm mất dữ liệu đang nhập.
// onClose giữ lại trong props để các nơi gọi không phải đổi; Modal tự nó không gọi.
// wide: true → lg, 'xl' → xl; size: 'sm' cho hộp xác nhận ngắn.
// eslint-disable-next-line no-unused-vars
export default function Modal({ open, onClose, wide, size, children }) {
  if (!open) return null
  const w = size ?? (wide === 'xl' ? 'xl' : wide ? 'lg' : '')
  // Portal ra <body>: phần tử cha có backdrop-filter sẽ “nhốt” position: fixed bên trong nó.
  return createPortal(
    <div className="ov show">
      <div className={'modal' + (w ? ' ' + w : '')} role="dialog" aria-modal="true">
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
