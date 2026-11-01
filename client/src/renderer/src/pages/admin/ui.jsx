import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'

export function Switch({ checked, onChange, disabled, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      className={'ai-switch' + (checked ? ' on' : '')}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span />
    </button>
  )
}

// Thay đổi lâm sàng bắt buộc ghi lý do (vào nhật ký thay đổi).
export function ConfirmDialog({ open, title, message, children, confirmLabel = 'Confirm', danger, requireNote, notePlaceholder, onConfirm, onCancel }) {
  const [note, setNote] = useState('')
  useEffect(() => {
    if (open) setNote('')
  }, [open])
  const blocked = requireNote && note.trim().length < 5
  return (
    <Modal open={open} onClose={onCancel}>
      <ModalHeader title={title} onClose={onCancel} />
      <div className="modal-body">
        {message && <p className="ai-confirm-msg">{message}</p>}
        {children}
        {requireNote && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>
              Reason for this change <span className="ai-req">*</span>
            </label>
            <textarea
              rows={3}
              value={note}
              placeholder={notePlaceholder ?? 'Recorded in the change log (at least 5 characters)'}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')}
          disabled={blocked}
          onClick={() => onConfirm(note.trim())}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function Empty({ icon = 'search', title, text }) {
  return (
    <div className="empty-state">
      <div className="ic">
        <Icon name={icon} />
      </div>
      <b>{title}</b>
      {text && <p>{text}</p>}
    </div>
  )
}
