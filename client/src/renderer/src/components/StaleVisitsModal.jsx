import { Fragment, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import Icon from './Icon'
import { useToast } from '../context/ToastContext'
import { translate } from '../i18n'
import { useQueue, closeStaleVisit, STALE_REASONS, ST, statusLabel } from '../api/queueStore'
import { ticketNo } from './queuePrint'
import { dmy } from '../pages/reception/shared'

// Lượt chưa đóng từ những ngày trước — Lễ tân xử lý đầu ngày: bệnh nhân quay lại trả tiền → Thu tiền;
// còn lại → Đóng lượt kèm lý do. Còn lượt chưa đóng thì bệnh nhân chưa tiếp đón lại được.
export default function StaleVisitsModal({ readOnly, onClose, onPay }) {
  const { showToast } = useToast()
  const { stale = [] } = useQueue()
  const [closing, setClosing] = useState(null)
  const [reason, setReason] = useState('left_waiting')
  const [note, setNote] = useState('')

  async function close(v) {
    const r = await closeStaleVisit(v.id, { reason, note })
    if (!r.ok) return showToast(translate(r.error), 'error')
    showToast(translate('Visit closed') + ' — ' + ticketNo(v.ticket) + ' ' + v.name)
    setClosing(null)
    setNote('')
  }
  // Hoá đơn của lượt cũ vẫn nằm trên server: mở thẳng màn thu tiền.
  function collect(v) {
    onClose()
    onPay(v)
  }

  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Open visits from previous days') + ' · ' + stale.length} onClose={onClose} />
      <div className="modal-b">
        <div className="banner i" style={{ marginBottom: 14 }}>
          <Icon name="info" />
          <div className="txt">{translate('These visits were not finished or not paid. Close each one with a reason, or collect payment if the patient came back. A patient with an open visit cannot be checked in again.')}</div>
        </div>
        {stale.length ? (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>{translate('No.')}</th>
                  <th>{translate('Patient')}</th>
                  <th>{translate('Step')}</th>
                  <th>{translate('Since')}</th>
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {stale.map(row)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <div className="ill">
              <Icon name="circle-check" />
            </div>
            <p className="muted">{translate('No open visits from previous days.')}</p>
          </div>
        )}
      </div>
      <div className="modal-f">
        <span className="sp" />
        <button className="btn btn-outline" onClick={onClose}>
          {translate('Close')}
        </button>
      </div>
    </Modal>
  )

  // Hàm dựng hàng (không phải component con) để ô ghi chú không bị dựng lại mỗi lần gõ.
  function row(v) {
    const paying = v.status === ST.PRESCRIBED
    return (
      <Fragment key={v.id}>
        <tr>
          <td className="num">
            <b>{ticketNo(v.ticket)}</b>
          </td>
          <td>
            <b>{v.name}</b>
            {v.doctor && <div className="muted small">{v.doctor}</div>}
          </td>
          <td>
            <span className={'badge ' + (paying ? 'b-warning' : 'b-neutral')}>{translate(statusLabel(v.status))}</span>
          </td>
          <td className="num muted">{dmy(v.carriedFrom + 'T00:00:00')}</td>
          <td>
            <div className="acts">
              {paying && (
                <button className="btn btn-outline btn-sm" disabled={readOnly} onClick={() => collect(v)}>
                  {translate('Collect payment')}
                </button>
              )}
              <button className="btn btn-ghost btn-sm" disabled={readOnly} onClick={() => (setClosing(closing === v.id ? null : v.id), setReason(paying ? 'unpaid_left' : 'left_waiting'), setNote(''))}>
                {translate('Close visit')}
              </button>
            </div>
          </td>
        </tr>
        {closing === v.id && (
          <tr className="sub-row">
            <td colSpan={5}>
              <div className="leave-reasons">
                {STALE_REASONS.map((r) => (
                  <label key={r.key} className={'leave-reason' + (reason === r.key ? ' on' : '')}>
                    <input type="radio" name={'stale-' + v.id} checked={reason === r.key} onChange={() => setReason(r.key)} /> <span>{r.label}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input className="input" type="text" style={{ flex: 1 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={translate('Note') + (reason === 'other' ? ' *' : '')} />
                <button className="btn btn-danger" disabled={reason === 'other' && !note.trim()} onClick={() => close(v)}>
                  {translate('Confirm close')}
                </button>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    )
  }
}
