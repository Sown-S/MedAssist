import { useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import PatientAlerts from '../../components/PatientAlerts'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { takePatient, takeNext, minutesSince, labRows, releaseVisit, leaveVisit, LEFT_REASONS, ST, useQueue, myInvite, inviteAgain, dropInvite } from '../../api/queueStore'
import { deleteDraft } from '../../api/draftStore'
import { dmy, hhmm } from '../reception/shared'
import { vitalsText } from '../../api/vitals'


const no = (t) => String(t).padStart(3, '0')

// Bị chặn vì còn người đang khám → hỏi lại: quay về người đó, hoặc (chỉ ca ưu tiên) vẫn mời và ghi nhật ký.
export function useTakePatient(open) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(null)

  async function run(target, force = false) {
    const r = await (target ? takePatient(target.id, user, { force }) : takeNext(user))
    // Chỉ gửi lời mời — quầy gọi bệnh nhân vào, bác sĩ bắt đầu khám ở thanh lời mời.
    if (r.ok && 'invited' in r) {
      const v = r.invited
      return showToast(v ? translate('Invited') + ' ' + no(v.ticket) + ' — ' + v.name + '. ' + translate('Reception will send the patient in.') : translate('Invited'))
    }
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

// Lời mời đang chờ của bác sĩ: bắt đầu khám (bệnh nhân phải đã check-in), gọi lại, hoặc báo không có mặt
// (bỏ lời mời, bệnh nhân giữ chỗ trong hàng chờ).
export function InviteBar({ onStart, compact = false }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { visits } = useQueue()
  const v = myInvite(user, visits)
  if (!v) return null
  const run = async (p, done) => {
    const r = await p
    showToast(translate(r.ok ? done : r.error))
  }
  const waiting = v.status === ST.WAITING
  return (
    <div className={'invite-bar' + (compact ? ' compact' : '')}>
      <div className="invite-who">
        <Icon name="megaphone" />
        <span>
          <b>
            {no(v.ticket)} — {v.name}
          </b>
          <small>
            {translate(waiting ? 'Invited — waiting for reception to check the patient in' : 'Invited — waiting for the patient to come in')} · {hhmm(v.calledAt)}
          </small>
        </span>
      </div>
      <div className="invite-acts">
        <button className="btn btn-primary btn-sm" disabled={waiting} onClick={() => onStart(v)} title={waiting ? translate('Reception has to check the patient in first.') : undefined}>
          <Icon name="stethoscope" /> Start the exam
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => run(inviteAgain(v.id), 'Called again')}>
          <Icon name="megaphone" /> Call again
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => run(dropInvite(v.id), 'Invitation cancelled — the patient keeps their place in the queue')}>
          Not here
        </button>
      </div>
    </div>
  )
}

// Hôm nay đã xong + các ngày trước, mới nhất trước; gộp lưu trữ lượt khám và lịch sử đơn, mỗi lượt lấy một lần.
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

export function PatientBrief({ v, past }) {
  const p = v
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

// Phiếu từ server có kết luận riêng (order.conclusion) và dòng đã huỷ.
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

// Bác sĩ khác nhận lại từ hàng chờ chung.
export function ReleaseModal({ visit, onClose, onDone }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  async function submit() {
    const r = await releaseVisit(visit.id, user)
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

// Bắt buộc lý do.
export function LeaveVisitModal({ visit, onClose, onDone }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [reason, setReason] = useState(visit.labOut ? 'no_return' : 'left_exam')
  const [note, setNote] = useState('')
  async function submit() {
    const r = await leaveVisit(visit.id, { reason, note }, user)
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
