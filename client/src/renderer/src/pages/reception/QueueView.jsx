import { useState } from 'react'
import PatientAlerts from '../../components/PatientAlerts'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { acknowledgeRedFlag, isPendingFlag } from '../../api/queueStore'
import { useQueue, STATUSES, ST, leftReasonLabel, minutesSince, waitingOrder, readyOrder, checkInVisit, atLabs, isInvited, isIntakeOpen } from '../../api/queueStore'
import { useToast } from '../../context/ToastContext'
import { printTicket } from '../../components/queuePrint'
import CallPanel from './CallPanel'
import { EditWaitingModal, CancelVisitModal } from '../../components/WaitingVisitModals'
import { hhmm, dmy, useNow } from './shared'
import { vitalsText } from '../../api/vitals'

// Số phút chờ bắt đầu thành vàng / đỏ, theo từng chặng.
const WAIT_LIMITS = { Waiting: [30, 60], CheckedIn: [15, 30], Examining: [30, 45], labs: [30, 60], Prescribed: [10, 20] }
// Ca cờ đỏ theo kết quả lượt khám (outcome của liveRedFlags): [lớp badge, nhãn].
const FLAG_BADGE = { referred: ['low', 'Transferred — doctors alerted'], seen: ['ok', 'Seen at the clinic'], queued: ['warn', 'Top of the queue (Emergency)'], left: ['warn', 'Left'] }

export default function QueueView({ readOnly, onPay }) {
  const { visits, redFlags } = useQueue()
  const now = useNow()
  const { showToast } = useToast()
  const [tab, setTab] = useState(ST.WAITING)
  const [editing, setEditing] = useState(null)
  const [cancelling, setCancelling] = useState(null)

  // Lượt đang tiếp đón không tính vào số người chờ, chỉ hiện mờ cuối tab Chờ.
  const byStatus = (s) => visits.filter((v) => v.status === s && !isIntakeOpen(v))
  const list =
    tab === ST.WAITING
      ? [...waitingOrder(visits).filter((v) => v.status === ST.WAITING), ...visits.filter(isIntakeOpen).sort((a, b) => a.ticket - b.ticket)]
      : tab === ST.CHECKED_IN
        ? readyOrder(visits)
        : byStatus(tab).sort((a, b) => ([ST.FINISHED, ST.CANCELLED].includes(tab) ? b.statusAt.localeCompare(a.statusAt) : a.statusAt.localeCompare(b.statusAt)))
  // Bác sĩ chỉ mời được người đã check-in.
  async function checkIn(v) {
    const r = await checkInVisit(v.id)
    showToast(r.ok ? translate('Checked in — doctors can now call') + ' ' + String(v.ticket).padStart(3, '0') : translate(r.error), r.ok ? 'ok' : 'error')
  }

  function waitOf(v) {
    if (isIntakeOpen(v)) return { label: translate('Intake in progress…'), level: 'ok' }
    if (v.status === ST.FINISHED) return { label: translate('Done') + ' ' + hhmm(v.statusAt), level: 'ok' }
    if (v.status === ST.CANCELLED) return { label: translate('Left') + ' ' + hhmm(v.statusAt), level: 'long' }
    // Server giữ giờ đi xét nghiệm (lab_out_at).
    if (atLabs(v)) {
      const n = minutesSince(v.labOutAt ?? v.statusAt, now)
      return { label: translate('Out for lab tests') + ' ' + n + ' ' + translate('min'), level: n >= 60 ? 'long' : 'ok' }
    }
    if (isInvited(v)) return { label: translate('Being called') + (v.calledRoom ? ' → ' + v.calledRoom : ''), level: 'warn' }
    const n = minutesSince(v.statusAt, now)
    const [warn, long] = WAIT_LIMITS[v.status] ?? [30, 60]
    const label = v.status === ST.EXAMINING ? `In consultation ${n} min` : `Waited ${n} min`
    return { label, level: n >= long ? 'long' : n >= warn ? 'warn' : 'ok' }
  }

  const meta = (v) => [translate(v.gender), v.age !== '' ? v.age + ' ' + translate('yrs') : null, translate(v.reason)].filter(Boolean).join(' · ')

  // Nút thao tác gọn trên từng dòng (giữ đúng các việc như trước).
  const iconBtn = (icon, title, onClick, disabled) => (
    <button className="icon-btn" title={translate(title)} aria-label={translate(title)} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
    </button>
  )
  function rowActions(v) {
    if (isIntakeOpen(v) || atLabs(v)) return null
    if (v.status === ST.WAITING || v.status === ST.CHECKED_IN)
      return (
        <span className="q-acts">
          {v.status === ST.WAITING && (
            <button className="btn btn-ghost btn-sm q-checkin" disabled={readOnly} onClick={() => checkIn(v)} title={translate('The patient is at the desk and it is nearly their turn')}>
              <Icon name="userCheck" /> Mark present — check in
            </button>
          )}
          <span className="q-icons">
            {iconBtn('pencil', v.status === ST.WAITING ? 'Re-measure vitals, flag as priority or report warning signs' : 'Re-measure vitals', () => setEditing(v), readOnly)}
            {iconBtn('printer', 'Print queue ticket', () => printTicket(v))}
            {iconBtn('x', 'Patient left before being called, or checked in by mistake', () => setCancelling(v), readOnly)}
          </span>
        </span>
      )
    if (v.status === ST.PRESCRIBED)
      return (
        <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => onPay(v)}>
          <Icon name="box" /> Dispense &amp; collect
        </button>
      )
    return null
  }
  const prioOf = (v) =>
    v.triage === 'emergency' && [ST.WAITING, ST.CHECKED_IN].includes(v.status) ? (
      <span className="badge low">{translate('Emergency')}</span>
    ) : v.priority && v.status !== ST.FINISHED ? (
      <span className="badge warn">{translate('Priority')}</span>
    ) : (
      <span className="plain">{translate('Routine')}</span>
    )

  return (
    <>
      <div className="rec-queue-col">
        <CallPanel readOnly={readOnly} variant="banner" />
        <div className="card">
          <div className="card-title q-head">
            <span>Today’s queue</span>
            <div className="itabs q-tabs">
              {STATUSES.map((s) => (
                <button key={s.key} className={'itab' + (tab === s.key ? ' active' : '')} onClick={() => setTab(s.key)}>
                  <span>{s.label}</span> <span className="itab-cnt">{byStatus(s.key).length}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="q-table-wrap">
            <table className="dt q-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Patient</th>
                  <th>Priority</th>
                  <th>Vital signs</th>
                  <th>Reason</th>
                  <th>Step / doctor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((v) => {
                  const w = waitOf(v)
                  return (
                    <tr key={v.id} className={'p-card q-row' + (isIntakeOpen(v) ? ' dimmed' : '') + (v.triage === 'emergency' ? ' emerg' : v.priority ? ' prio' : '')}>
                      <td>
                        <b className="mono q-no" title={translate('Arrival time') + ' ' + hhmm(v.arrivedAt)}>{String(v.ticket).padStart(3, '0')}</b>
                        <small className="q-sub mono">{hhmm(v.arrivedAt)}</small>
                      </td>
                      <td>
                        <b className="q-name" title={translate('Patient ID') + ': ' + v.patientId}>{v.name}</b>
                        <small className="q-sub">{meta(v)}</small>
                        <PatientAlerts p={v} compact />
                        {v.carriedFrom && (
                          <span className="badge warn">
                            {translate('Unpaid from')} {dmy(v.carriedFrom + 'T00:00:00')}
                          </span>
                        )}
                      </td>
                      <td>{prioOf(v)}</td>
                      <td className="q-vit">{v.status !== ST.FINISHED && v.status !== ST.PRESCRIBED ? vitalsText(v.vitals) : '—'}</td>
                      <td className="q-reason">{translate(v.reason) || '—'}</td>
                      <td>
                        <span className={'p-wait ' + w.level}>{w.label}</span>
                        {v.status === ST.CHECKED_IN && <span className="badge ok">{translate('Checked in')}</span>}
                        {v.doctor && <small className="q-sub">{v.doctor + (v.room ? ' · ' + v.room : '')}</small>}
                        {v.left && <small className="q-sub">{translate(leftReasonLabel(v.left.reason)) + (v.left.note ? ' — ' + v.left.note : '')}</small>}
                      </td>
                      <td className="q-act-cell">{rowActions(v)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!list.length && <p className="ai-soft" style={{ fontSize: 14, margin: '8px 2px' }}>No patients in this step.</p>}
          </div>
        </div>

        <div className="card redflag-card">
          <div className="card-title">
            <Icon name="siren" /> Emergency cases <span className="cnt">{redFlags.length}</span>
          </div>
          <p className="redflag-card-note">Cases matching a red-flag rule: transferred to hospital at once, or placed at the top of the queue as Emergency. Doctors are alerted in both cases.</p>
          <div className="redflag-grid">
            {redFlags.map((r) => (
              <div className="redflag-item" key={r.id}>
                <div className="top">
                  <b>{r.name}</b>
                  <span className="time">{hhmm(r.at)}</span>
                </div>
                <div className="signs">{translate(r.signs) || '—'}</div>
                {isPendingFlag(r) && !r.ack && (
                  <div className="rf-todo">
                    <span>
                      {r.outcome === 'queued'
                        ? translate('Emergency — placed at the top of the queue; doctors have been alerted. Transfer to hospital if the patient gets worse.')
                        : r.outcome === 'assess'
                          ? translate('Waiting for a doctor to assess — keep the patient at the desk.')
                          : r.outcome === 'seen'
                            ? translate('Doctor') + ' ' + r.doctorReview.by + ' ' + translate('will see the patient at the clinic — check them in as Priority.')
                            : translate('Emergency — send the patient to hospital now (call 115 if needed); do not wait for a doctor. Doctors have been alerted.') +
                              (r.doctorReview ? ' ' + translate('Confirmed by doctor') + ' ' + r.doctorReview.by + '.' : '')}
                    </span>
                    {r.outcome !== 'assess' && (
                      <button className="btn btn-sm rf-ack" disabled={readOnly} onClick={() => acknowledgeRedFlag(r.id)}>
                        {r.outcome === 'seen' ? translate('Done') : translate('Patient guided')}
                      </button>
                    )}
                  </div>
                )}
                <div className="foot">
                  {r.doctorReview ? (
                    <span className={'badge ' + (r.doctorReview.decision === 'referred' ? 'low' : 'ok')}>
                      {translate(r.doctorReview.decision === 'referred' ? 'Referred' : 'Seen at the clinic')} · {r.doctorReview.by}
                    </span>
                  ) : (
                    <span className={'badge ' + FLAG_BADGE[r.outcome][0]}>{translate(FLAG_BADGE[r.outcome][1])}</span>
                  )}
                  <span>{r.by}</span>
                </div>
              </div>
            ))}
          </div>
          {!redFlags.length && <p className="ai-soft" style={{ fontSize: 14 }}>No red-flag cases today.</p>}
        </div>
      </div>
      {editing && <EditWaitingModal visit={editing} onClose={() => setEditing(null)} />}
      {cancelling && <CancelVisitModal visit={cancelling} onClose={() => setCancelling(null)} />}
    </>
  )
}
