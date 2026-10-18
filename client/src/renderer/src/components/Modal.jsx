import { createPortal } from 'react-dom'

// Thay cho openModal(id)/closeModal(id) thao tác thẳng lên DOM bằng classList,
// giờ modal chỉ hiện ra khi prop `open` là true — đúng tư duy "UI = hàm của state" của React.
export default function Modal({ open, onClose, wide, children }) {
  if (!open) return null
  // Portal ra <body>: phần tử cha có backdrop-filter (topbar, card) sẽ "nhốt" position:fixed bên trong nó.
  return createPortal(
    <div
      className="modal-overlay show"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
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
