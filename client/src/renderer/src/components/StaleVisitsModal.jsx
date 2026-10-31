import { useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import Icon from './Icon'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { translate } from '../i18n'
import { useQueue, closeStaleVisit, reopenStaleForPayment, STALE_REASONS, ST, statusLabel } from '../api/queueStore'
import { estimateTotal } from '../api/billing'
import { ticketNo } from './queuePrint'
import { fmt, dmy } from '../pages/reception/shared'

// Lượt chưa đóng từ những ngày trước (backend: GET /visits/stale) — Lễ tân xử lý đầu ngày:
//  - bệnh nhân quay lại trả tiền → "Thu tiền" (lượt về hàng chờ hôm nay ở bước Chờ thanh toán);
//  - còn lại → "Đóng lượt" kèm lý do (POST /visits/stale/cancel). Còn lượt chưa đóng thì bệnh nhân chưa tiếp đón lại được.
export default function StaleVisitsModal({ readOnly, onClose, onPay }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { stale = [] } = useQueue()
  const [closing, setClosing] = useState(null) // id lượt đang chọn lý do
  const [reason, setReason] = useState('left_waiting')
  const [note, setNote] = useState('')

  async function close(v) {
    const r = await closeStaleVisit(v.id, { reason, note }, user)
    if (!r.ok) return showToast(translate(r.error))
    showToast(translate('Visit closed') + ' — ' + ticketNo(v.ticket) + ' ' + v.name)
    setClosing(null)
    setNote('')
  }
  function collect(v) {
    const r = reopenStaleForPayment(v.id, user)
    if (!r.ok) return showToast(translate(r.error))
    onClose()
    onPay(r.visit)
  }

  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Open visits from previous days') + ' · ' + stale.length} onClose={onClose} />
      <div className="modal-body">
        <p className="ai-soft" style={{ fontSize: 13, marginTop: 0 }}>
          These visits were not finished or not paid. Close each one with a reason, or collect payment if the patient came back. A patient with an open visit cannot be checked in again.
        </p>
        {stale.map((v) => (
          <div key={v.id} className="stale-row">
            <div className="stale-head">
              <span className="p-ticket">{ticketNo(v.ticket)}</span>
              <span className="wait-main">
                <b>{v.name}</b>
                <small>
                  {dmy(v.carriedFrom + 'T00:00:00')} · {translate(statusLabel(v.status))}
                  {v.doctor ? ' · ' + v.doctor : ''}
                  {v.status === ST.PRESCRIBED ? ' · ' + translate('Estimated total') + ' ' + fmt(estimateTotal(v)) : ''}
                </small>
              </span>
              {v.status === ST.PRESCRIBED && (
                <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => collect(v)}>
                  Collect payment
                </button>
              )}
              <button className="btn btn-ghost btn-sm" disabled={readOnly} onClick={() => (setClosing(closing === v.id ? null : v.id), setReason(v.status === ST.PRESCRIBED ? 'unpaid_left' : 'left_waiting'), setNote(''))}>
                <Icon name="x" /> Close visit
              </button>
            </div>
            {closing === v.id && (
              <div className="stale-close">
                <div className="leave-reasons">
                  {STALE_REASONS.map((r) => (
                    <label key={r.key} className={'leave-reason' + (reason === r.key ? ' on' : '')}>
                      <input type="radio" name={'stale-' + v.id} checked={reason === r.key} onChange={() => setReason(r.key)} /> <span>{r.label}</span>
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input type="text" style={{ flex: 1 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={translate('Note') + (reason === 'other' ? ' *' : '')} />
                  <button className="btn btn-primary btn-sm" style={{ background: 'var(--warn)' }} disabled={reason === 'other' && !note.trim()} onClick={() => close(v)}>
                    <Icon name="check" /> Confirm close
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!stale.length && <p className="ai-soft">{translate('No open visits from previous days.')}</p>}
      </div>
    </Modal>
  )
}
