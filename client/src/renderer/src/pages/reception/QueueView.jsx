import { useState } from 'react'
import PatientQueueCard from '../../components/PatientQueueCard'
import PatientAlerts from '../../components/PatientAlerts'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { useQueue, STATUSES, ST, leftReasonLabel, minutesSince, waitingOrder, readyOrder, payStatusOf, markLabReturned, checkInVisit, atLabs } from '../../api/queueStore'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useInvoices, invoiceById } from '../../api/invoiceStore'
import { estimateTotal } from '../../api/billing'
import { printTicket, printReceipt } from '../../components/queuePrint'
import CallPanel from './CallPanel'
import { EditWaitingModal, CancelVisitModal } from '../../components/WaitingVisitModals'
import { fmt, hhmm, dmy, methodLabel, useNow, PAY_STATUS } from './shared'
import { vitalsText } from '../../api/vitals'

// Phút chờ bắt đầu thành vàng / đỏ, theo từng chặng.
const WAIT_LIMITS = { Waiting: [30, 60], CheckedIn: [15, 30], Examining: [30, 45], labs: [30, 60], Prescribed: [10, 20] }

// Hàng chờ đầy đủ theo máy trạng thái của backend: Chờ → Đã check-in → Đang khám → Chờ thanh toán → Hoàn tất / Huỷ.
export default function QueueView({ readOnly, onPay, onRx }) {
  const { visits, redFlags, calling } = useQueue()
  useInvoices()
  const now = useNow()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [tab, setTab] = useState(ST.WAITING)
  const [editing, setEditing] = useState(null)
  const [cancelling, setCancelling] = useState(null)

  const byStatus = (s) => visits.filter((v) => v.status === s)
  const list =
    tab === ST.WAITING
      ? waitingOrder(visits).filter((v) => v.status === ST.WAITING)
      : tab === ST.CHECKED_IN
        ? readyOrder(visits)
        : byStatus(tab).sort((a, b) => ([ST.FINISHED, ST.CANCELLED].includes(tab) ? b.statusAt.localeCompare(a.statusAt) : a.statusAt.localeCompare(b.statusAt)))
  // Lễ tân xác nhận bệnh nhân có mặt khi tới lượt (PATCH /visits/{id}/check-in) — bác sĩ chỉ mời được người đã check-in.
  async function checkIn(v) {
    const r = await checkInVisit(v.id, user)
    showToast(r.ok ? translate('Checked in — doctors can now call') + ' ' + String(v.ticket).padStart(3, '0') : translate(r.error))
  }

  function waitOf(v) {
    if (v.status === ST.FINISHED) return { label: translate('Done') + ' ' + hhmm(v.statusAt), level: 'ok' }
    if (v.status === ST.CANCELLED) return { label: translate('Left') + ' ' + hhmm(v.statusAt), level: 'long' }
    if (atLabs(v) && v.labReturnedAt) return { label: translate('Back from lab') + ' ' + hhmm(v.labReturnedAt), level: 'warn' }
    if (atLabs(v)) return { label: translate('Out for lab tests') + ' ' + minutesSince(v.statusAt, now) + ' ' + translate('min'), level: minutesSince(v.statusAt, now) >= 60 ? 'long' : 'ok' }
    if (v.status === ST.EXAMINING && v.entered === false) return { label: translate('Being called') + (v.room ? ' → ' + v.room : ''), level: 'warn' }
    if (v.absent) return { label: translate('Not here'), level: 'long' }
    const n = minutesSince(v.statusAt, now)
    const [warn, long] = WAIT_LIMITS[v.status] ?? [30, 60]
    const label = v.status === ST.EXAMINING ? `In consultation ${n} min` : `Waited ${n} min`
    return { label, level: n >= long ? 'long' : n >= warn ? 'warn' : 'ok' }
  }

  function detailsOf(v) {
    const rows = [
      { label: 'Patient ID', value: v.patientId },
      { label: 'Arrival time', value: hhmm(v.arrivedAt) + ' · ' + translate('at the clinic') + ' ' + minutesSince(v.arrivedAt, now) + ' ' + translate('min') }
    ]
    if (v.status !== ST.FINISHED && v.status !== ST.PRESCRIBED)
      rows.push({ label: 'Vital signs', value: vitalsText(v.vitals) })
    if (v.doctor) rows.push({ label: 'Doctor', value: v.doctor + (v.room ? ' · ' + v.room : '') })
    if (v.left) rows.push({ label: 'Reason', value: translate(leftReasonLabel(v.left.reason)) + (v.left.note ? ' — ' + v.left.note : '') })
    const ps = payStatusOf(v)
    const inv = v.invoiceId && invoiceById(v.invoiceId)
    if (ps === 'unpaid') rows.push({ label: 'Estimated total', value: fmt(estimateTotal(v)) })
    if (inv && inv.status !== 'cancelled')
      rows.push({ label: 'Invoice', value: inv.id + ' · ' + fmt(inv.total) + ' · ' + translate(methodLabel(inv.method)) + ' · ' + translate(PAY_STATUS[inv.status].label) })
    return rows
  }

  function actionsOf(v) {
    const inv = v.invoiceId && invoiceById(v.invoiceId)
    if (v.status === ST.WAITING)
      return (
        <>
          <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => checkIn(v)} title={translate('The patient is at the desk and it is nearly their turn')}>
            <Icon name="check" /> Mark present — check in
          </button>
          <button className="btn btn-ghost btn-sm" disabled={readOnly} onClick={() => setEditing(v)} title={translate('Re-measure vitals, flag as priority or report warning signs')}>
            <Icon name="pencil" /> Edit
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => printTicket(v)}>
            <Icon name="printer" /> Print queue ticket
          </button>
          <button className="btn btn-ghost btn-sm" disabled={readOnly} onClick={() => setCancelling(v)} title={translate('Patient left before being called, or checked in by mistake')}>
            <Icon name="x" /> Cancel visit
          </button>
        </>
      )
    if (v.status === ST.CHECKED_IN)
      return (
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => printTicket(v)}>
            <Icon name="printer" /> Print queue ticket
          </button>
          <button className="btn btn-ghost btn-sm" disabled={readOnly} onClick={() => setCancelling(v)} title={translate('Patient left before being called, or checked in by mistake')}>
            <Icon name="x" /> Cancel visit
          </button>
        </>
      )
    // Bệnh nhân cầm kết quả xét nghiệm quay lại → báo bác sĩ phụ trách.
    if (atLabs(v))
      return v.labReturnedAt ? null : (
        <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => markLabReturned(v.id)}>
          <Icon name="flask" /> Back from lab — notify doctor
        </button>
      )
    const rx = v.rx.length > 0 && (
      <button className="btn btn-ghost btn-sm" onClick={() => onRx(v)}>
        <Icon name="eye" /> View prescription
      </button>
    )
    if (v.status === ST.PRESCRIBED)
      return (
        <>
          {rx}
          <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => onPay(v)}>
            <Icon name="box" /> Dispense &amp; collect
          </button>
        </>
      )
    if (v.status === ST.FINISHED && inv)
      return (
        <>
          {rx}
          <button className="btn btn-ghost btn-sm" onClick={() => printReceipt(inv)}>
            <Icon name="printer" /> Reprint receipt
          </button>
        </>
      )
    return rx || null
  }

  const meta = (v) => [translate(v.gender), v.age !== '' ? v.age + ' ' + translate('yrs') : null, translate(v.reason)].filter(Boolean).join(' · ')

  return (
    <>
      <div className="rec-queue-grid">
        <div>
          <CallPanel readOnly={readOnly} />
          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-title">
              Today’s queue <span className="cnt">{visits.length}</span>
            </div>
            <div className="itabs" style={{ flexWrap: 'wrap' }}>
              {STATUSES.map((s) => (
                <button key={s.key} className={'itab' + (tab === s.key ? ' active' : '')} onClick={() => setTab(s.key)}>
                  <span>{s.label}</span> <span className="itab-cnt">{byStatus(s.key).length}</span>
                </button>
              ))}
            </div>
            <div className="scroll-list">
              {list.map((v) => (
                <PatientQueueCard
                  key={v.id}
                  ticket={v.ticket}
                  name={v.name}
                  meta={meta(v)}
                  wait={waitOf(v)}
                  priority={v.priority && v.status !== ST.FINISHED}
                  badges={
                    <>
                      {v.triage === 'emergency' && [ST.WAITING, ST.CHECKED_IN].includes(v.status) && <span className="badge low">{translate('Emergency')}</span>}
                      {v.allergies && <span className="allergy-chip">Allergy</span>}
                      {v.carriedFrom && <span className="badge warn">{translate('Unpaid from')} {dmy(v.carriedFrom + 'T00:00:00')}</span>}
                      {v.status === ST.WAITING && (
                        <button
                          className="btn btn-primary btn-sm q-checkin"
                          disabled={readOnly}
                          onClick={(e) => {
                            e.stopPropagation()
                            checkIn(v)
                          }}
                          title={translate('The patient is at the desk and it is nearly their turn')}
                        >
                          <Icon name="check" /> {translate('Mark present')}
                        </button>
                      )}
                      {v.status === ST.CHECKED_IN && <span className="badge ok">{translate('Checked in')}</span>}
                    </>
                  }
                  extra={<PatientAlerts p={v} compact />}
                  details={detailsOf(v)}
                  actions={actionsOf(v)}
                />
              ))}
              {!list.length && <p className="ai-soft" style={{ fontSize: 14, margin: '8px 2px' }}>No patients in this step.</p>}
            </div>
          </div>
        </div>

        <div className="card redflag-card">
          <div className="card-title">
            <Icon name="ban" /> Red-flag cases <span className="cnt">{redFlags.length}</span>
          </div>
          <p className="redflag-card-note">Cases matching a red-flag rule: transferred to hospital at once, or placed at the top of the queue as Emergency. Doctors are alerted in both cases.</p>
          {redFlags.map((r) => (
            <div className="redflag-item" key={r.id}>
              <div className="top">
                <b>{r.name}</b>
                <span className="time">{hhmm(r.at)}</span>
              </div>
              <div className="signs">{translate(r.signs) || '—'}</div>
              <div className="foot">
                {r.doctorReview ? (
                  <span className={'badge ' + (r.doctorReview.decision === 'referred' ? 'low' : 'ok')}>
                    {translate(r.doctorReview.decision === 'referred' ? 'Referred' : 'Seen at the clinic')} · {r.doctorReview.by}
                  </span>
                ) : (
                  <span className={'badge ' + (r.outcome === 'referred' ? 'low' : 'warn')}>
                    {translate(r.outcome === 'referred' ? 'Transferred — doctors alerted' : r.outcome === 'queued' ? 'Top of the queue (Emergency)' : 'Waiting for a doctor')}
                  </span>
                )}
                <span>{r.by}</span>
              </div>
            </div>
          ))}
          {!redFlags.length && <p className="ai-soft" style={{ fontSize: 14 }}>No red-flag cases today.</p>}
        </div>
      </div>
      {editing && <EditWaitingModal visit={editing} onClose={() => setEditing(null)} />}
      {cancelling && <CancelVisitModal visit={cancelling} onClose={() => setCancelling(null)} />}
    </>
  )
}
