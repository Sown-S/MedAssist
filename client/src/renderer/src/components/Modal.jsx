import { createPortal } from 'react-dom'

// Chỉ đóng bằng nút X (ModalHeader) hoặc nút Hủy của từng modal: bấm nhầm ra vùng mờ không được làm mất dữ liệu đang nhập.
// onClose giữ lại trong props để các nơi gọi không phải đổi; Modal tự nó không gọi.
// eslint-disable-next-line no-unused-vars
export default function Modal({ open, onClose, wide, children }) {
  if (!open) return null
  // Portal ra <body>: phần tử cha có backdrop-filter sẽ “nhốt” position: fixed bên trong nó.
  return createPortal(
    <div className="modal-overlay show">
      <div className={'modal-box' + (wide ? ' wide' : '')}>{children}</div>
    </div>,
    document.body
  )
}

export function ModalHeader({ title, onClose }) {
  return (
    <div className="modal-head">
      <h3>{title}</h3>
      <button className="modal-close" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}
