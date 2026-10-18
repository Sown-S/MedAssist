import Icon from './Icon'
// Thay cho confirm() của trình duyệt (xấu, không đồng bộ style) — 1 modal nhỏ,
// nhận vào message + 2 callback. Dùng lại được ở bất kỳ đâu cần "chắc chắn muốn xoá?".
export default function ConfirmModal({ open, message, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="modal-overlay show center" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm-box">
        <div className="ic">
  <Icon name="alert" />
</div>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn" style={{ background: 'var(--warn)', color: '#fff' }} onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
