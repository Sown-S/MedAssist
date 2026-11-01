import Icon from './Icon'
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
