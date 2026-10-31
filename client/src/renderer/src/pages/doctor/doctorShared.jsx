import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import PatientAlerts from '../../components/PatientAlerts'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { takePatient, takeNext, minutesSince, labRows, releaseVisit, leaveVisit, LEFT_REASONS, ST } from '../../api/queueStore'
import { getDraft, deleteDraft } from '../../api/draftStore'
import { findPatient } from '../../api/patientStore'
import { dmy, hhmm } from '../reception/shared'
import { vitalsText } from '../../api/vitals'

// Dùng chung cho các màn Bác sĩ: mời bệnh nhân (có điều kiện "khám xong người trong phòng"),
// hồ sơ bệnh lý sơ lược, lịch sử lượt khám và kết quả cận lâm sàng của một bệnh nhân.

const no = (t) => String(t).padStart(3, '0')

// Mời bệnh nhân vào phòng. Bị chặn vì còn người đang khám → hiện hộp thoại: quay lại người đang khám,
// hoặc (chỉ với ca ưu tiên) vẫn mời và ghi nhật ký. open(id): mở phòng khám với lượt khám đó.
export function useTakePatient(open) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(null)

  async function run(target, force = false) {
    const r = await (target ? takePatient(target.id, user, { force }) : takeNext(user, { force }))
    if (r.ok) {
      setBusy(null)
      showToast(translate('Now seeing') + ' ' + no(r.visit.ticket) + ' — ' + r.visit.name)
      return open(r.visit.id)
    }
    if (r.busy) return setBusy(r)
    showToast(translate(r.error))
  }

  const dialog = busy && (
    <Modal open onClose={() => setBusy(null)}>
      <ModalHeader title={translate('A patient is still in your room')} onClose={() => setBusy(null)} />
      <div className="modal-body">
        <div className="busy-current">
          <span className="p-ticket">{no(busy.busy.ticket)}</span>
          <div>
            <b>{busy.busy.name}</b>
            <small>{translate('In consultation ' + minutesSince(busy.busy.statusAt) + ' min')}</small>
          </div>
        </div>
        <p className="ai-soft" style={{ fontSize: 13.5 }}>
          Finalize this visit or send the patient for lab tests before calling the next one, so no one is left half-examined.
        </p>
        {busy.target.priority && (
          <div className="warn-banner show caution">
            <div className="icon">
              <Icon name="zap" />
            </div>
            <div className="txt">
              <b>
                {no(busy.target.ticket)} — {busy.target.name} · {translate('Priority')}
              </b>
              <span>A priority patient can be called in now; the current visit stays open and this is recorded in the activity log.</span>
            </div>
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={() => setBusy(null)}>
          Cancel
        </button>
        {busy.target.priority && (
          <button className="btn btn-ghost" onClick={() => run(busy.target, true)}>
            <Icon name="zap" /> Call in anyway
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={() => {
            setBusy(null)
            open(busy.busy.id)
          }}
        >
          <Icon name="stethoscope" /> {translate('Back to') + ' ' + busy.busy.name}
        </button>
      </div>
    </Modal>
  )
  return { take: (v) => run(v), next: () => run(null), dialog }
}

// Các lượt khám TRƯỚC của một bệnh nhân (hôm nay đã xong + các ngày trước), mới nhất trước.
// Gộp lưu trữ lượt khám (visitArchive) và lịch sử đơn thuốc (rxHistory) — cùng một lượt chỉ lấy một lần.
export function pastVisitsOf(patientId, { visits = [], archive = [], history = [], exclude } = {}) {
  if (!patientId) return []
  const seen = new Set()
  const at = (v) => v.rxAt ?? v.statusAt ?? v.arrivedAt ?? ''
  return [
    ...visits.filter((v) => v.status === ST.PRESCRIBED || v.status === ST.FINISHED || (v.status === ST.CANCELLED && (v.draftNotes || v.labOrders?.length))),
    ...archive.filter((v) => v.outcome !== 'left' || v.labOrders?.length || v.draftNotes),
    ...history
  ]
    .filter((v) => v.patientId === patientId && v.id !== exclude)
    .sort((a, b) => at(b).localeCompare(at(a)))
    .filter((v) => !seen.has(v.id) && seen.add(v.id))
}

// Hồ sơ bệnh lý sơ lược — xem trước khi mời bệnh nhân vào phòng.
export function PatientBrief({ v, past }) {
  const p = findPatient(v.patientId) ?? v
  const last = past[0]
  return (
    <div className="brief">
      <PatientAlerts p={p} />
      <div className="brief-grid">
        <div>
          <span className="brief-k">Reason for visit</span>
          <span>{translate(v.reason)}</span>
        </div>
        <div>
          <span className="brief-k">Vitals at check-in</span>
          <span className="mono">{vitalsText(v.vitals)}</span>
        </div>
        <div>
          <span className="brief-k">Previous visits</span>
          <span>{past.length}</span>
        </div>
      </div>
      {last ? (
        <div className="brief-last">
          <span className="brief-k">Last visit</span>
          <span>
            <b className="mono">{dmy(last.rxAt ?? last.statusAt)}</b> · {last.doctor || '—'} · {last.diagnosis || translate(last.reason ?? '') || '—'}
          </span>
          {last.rx?.length > 0 && <small>{last.rx.map((x) => `${x.name} × ${x.qty}`).join(', ')}</small>}
        </div>
      ) : (
        <p className="ai-soft" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
          First visit — no earlier records in the system.
        </p>
      )}
    </div>
  )
}

// Một phiếu chỉ định xét nghiệm kèm kết quả từng dòng (chỉ xem). Phiếu từ server có kết luận riêng (order.conclusion)
// và dòng đã huỷ (bệnh nhân không làm).
export function LabOrderResults({ order, summary }) {
  const rows = labRows(order)
  const conclusion = summary || order.conclusion
  return (
    <div className="lab-res">
      <div className="lab-res-head">
        <span className="mono">
          {hhmm(order.at)} {dmy(order.at)}
        </span>
        <span>· {order.by}</span>
        {order.diagnosis && <span className="ai-soft">· {order.diagnosis}</span>}
      </div>
      <table className="dt lab-res-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.cancelled ? 'ai-dim' : ''}>
              <td>{r.cancelled ? <s>{r.name}</s> : r.name}</td>
              <td className={r.result ? '' : 'ai-soft'}>{r.cancelled ? translate('Cancelled — not done') : r.result || translate('No result yet')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {conclusion && (
        <p className="lab-res-sum">
          <b>{translate('Conclusion')}:</b> {conclusion}
        </p>
      )}
    </div>
  )
}

// Trả bệnh nhân về hàng chờ (backend: PATCH /visits/{id}/release) — bác sĩ khác nhận lại từ hàng chờ chung.
// draft: phiếu khám đang viết dở (nếu có) — đi kèm lượt khám để người sau đọc tiếp.
export function ReleaseModal({ visit, draft, onClose, onDone }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  async function submit() {
    const r = await releaseVisit(visit.id, { draft: draft ?? getDraft(visit.id) ?? null }, user)
    if (!r.ok) return showToast(translate(r.error))
    deleteDraft(visit.id)
    showToast('Returned to the waiting queue')
    onDone?.()
  }
  return (
    <Modal open onClose={onClose}>
      <ModalHeader title={translate('Return to queue') + ' — ' + visit.name} onClose={onClose} />
      <div className="modal-body">
        <p className="ai-soft" style={{ fontSize: 13, marginTop: 0 }}>
          The patient goes back to the waiting queue; any doctor can call them in again. Your unfinished notes stay with the visit.
        </p>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit}>
          <Icon name="repeat" /> Return to queue
        </button>
      </div>
    </Modal>
  )
}

// Đóng lượt khám khi bệnh nhân bỏ về / không quay lại sau xét nghiệm / từ chối khám — bắt buộc lý do, lưu kèm ghi chép đã viết.
export function LeaveVisitModal({ visit, draft, onClose, onDone }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [reason, setReason] = useState(visit.labOut ? 'no_return' : 'left_exam')
  const [note, setNote] = useState('')
  async function submit() {
    const r = await leaveVisit(visit.id, { reason, note, draft: draft ?? getDraft(visit.id) ?? null }, user)
    if (!r.ok) return showToast(translate(r.error))
    deleteDraft(visit.id)
    showToast('Visit closed — your notes were kept in the patient’s history')
    onDone?.()
  }
  return (
    <Modal open onClose={onClose}>
      <ModalHeader title={translate('Patient left') + ' — ' + visit.name} onClose={onClose} />
      <div className="modal-body">
        <p className="ai-soft" style={{ fontSize: 13, marginTop: 0 }}>
          The visit is closed without an invoice. To charge the consultation fee, finalize the visit without drugs instead.
        </p>
        <div className="field">
          <label>Reason</label>
          <div className="leave-reasons">
            {LEFT_REASONS.map((r) => (
              <label key={r.key} className={'leave-reason' + (reason === r.key ? ' on' : '')}>
                <input type="radio" name="leave" checked={reason === r.key} onChange={() => setReason(r.key)} /> <span>{r.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>
            Note {reason === 'other' && <span className="req">*</span>}
          </label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called twice, no answer; advised to come back if the fever persists" />
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={reason === 'other' && !note.trim()}>
          <Icon name="check" /> Close visit
        </button>
      </div>
    </Modal>
  )
}
