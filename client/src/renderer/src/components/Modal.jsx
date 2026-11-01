import { createPortal } from 'react-dom'

export default function Modal({ open, onClose, wide, children }) {
  if (!open) return null
  // Portal ra <body>: phần tử cha có backdrop-filter sẽ “nhốt” position: fixed bên trong nó.
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
