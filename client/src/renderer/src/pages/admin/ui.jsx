import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'
import EmptyState from '../../components/ui/EmptyState'

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
      <div className="modal-b">
        {message && (
          <div className="confirm">
            <div className={'ico ' + (danger ? 'd' : 'w')}>
              <Icon name="triangle-alert" />
            </div>
            <p>{message}</p>
          </div>
        )}
        {children}
        {requireNote && (
          <div className="field mt-12">
            <label>
              Reason for this change <span className="req">*</span>
            </label>
            <textarea className="input"
              rows={3}
              value={note}
              placeholder={notePlaceholder ?? 'Recorded in the change log (at least 5 characters)'}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="modal-f">
        <button className="btn btn-outline" onClick={onCancel}>
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

// Giữ tên cũ cho các trang quản trị; dùng chung components/ui/EmptyState.
export function Empty({ icon = 'search', title, text }) {
  return <EmptyState icon={icon} title={title} text={text} />
}
