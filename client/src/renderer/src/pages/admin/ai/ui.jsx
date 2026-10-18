import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import Icon from '../../../components/Icon'
import { typeOf, symptomLabel, vitalOf, opLabel, icdLabel, fmtWeight, fmtTime } from './catalog'

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

export function TypeBadge({ type }) {
  const t = typeOf(type)
  return <span className={'badge ' + t.tone}>{t.short}</span>
}

// Điều kiện của quy tắc dưới dạng các "chip" — mỗi mẩu chữ là 1 phần tử riêng để được dịch.
export function CondChips({ cond }) {
  if (!cond) return <span className="ai-soft">—</span>
  return (
    <div className="ai-chips">
      {cond.symptoms.map((s) => (
        <span className="ai-chip" key={s}>
          {symptomLabel(s)}
        </span>
      ))}
      {(cond.absent ?? []).map((s) => (
        <span className="ai-chip neg" key={'no-' + s}>
          <span>No</span> <span>{symptomLabel(s)}</span>
        </span>
      ))}
      {(cond.ageMin != null || cond.ageMax != null) && (
        <span className="ai-chip meta">
          <span>Age</span>{' '}
          <span className="mono">
            {cond.ageMin != null && cond.ageMax != null
              ? `${cond.ageMin}–${cond.ageMax}`
              : cond.ageMin != null
                ? `≥ ${cond.ageMin}`
                : `≤ ${cond.ageMax}`}
          </span>
        </span>
      )}
      {cond.minDays != null && (
        <span className="ai-chip meta">
          <span>Duration</span> <span className="mono">≥ {cond.minDays}</span> <span>days</span>
        </span>
      )}
      {(cond.vitals ?? []).map((v, i) => (
        <span className="ai-chip vital" key={'v' + i}>
          <span>{vitalOf(v.key).label}</span>{' '}
          <span className="mono">
            {opLabel(v.op)} {v.value} {vitalOf(v.key).unit}
          </span>
        </span>
      ))}
    </div>
  )
}

export function IcdCell({ code }) {
  if (!code) return <span className="ai-soft">—</span>
  return (
    <span>
      <b className="mono">{code}</b> <span>{icdLabel(code)}</span>
    </span>
  )
}

export function WeightCell({ w }) {
  return (
    <div className="ai-weight">
      <span className="mono">{fmtWeight(w)}</span>
      <div className="ai-weight-bar">
        <div style={{ width: Math.max(0, Math.min(1, w)) * 100 + '%' }} />
      </div>
    </div>
  )
}

export function RuleStatus({ rule }) {
  let main
  if (rule.version === 0) main = <span className="badge">New — not live</span>
  else if (rule.retired) main = <span className="badge muted">Retired</span>
  else if (!rule.enabled)
    main = (
      <span className="badge warn" title={rule.disabled ? rule.disabled.by + ' · ' + fmtTime(rule.disabled.at) + ' — ' + rule.disabled.note : undefined}>
        Turned off
      </span>
    )
  else main = <span className="badge ok">Live</span>
  return (
    <div className="ai-status">
      {main}
      {rule.pending &&
        (rule.pending.stage === 'review' ? (
          <span className="badge info">Pending review</span>
        ) : (
          <span className="badge">Draft change</span>
        ))}
    </div>
  )
}

export const KIND_LABEL = {
  create: 'New rule',
  edit: 'Edit',
  enable: 'Turn on',
  disable: 'Turn off',
  retire: 'Retire',
  restore: 'Restore',
  rollback: 'Roll back'
}

// Hộp xác nhận cho thay đổi lâm sàng: bắt buộc ghi lý do (đi vào nhật ký thay đổi).
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
