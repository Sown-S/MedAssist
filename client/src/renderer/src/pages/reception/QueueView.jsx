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
import { useNow } from './shared'
import { vitalsText } from '../../api/vitals'
import useNewIds from '../../hooks/useNewIds'
import Clip from '../../components/Clip'
import { hhmm, dmy } from '../../utils/format'

// Số phút chờ bắt đầu thành vàng / đỏ, theo từng chặng.
const WAIT_LIMITS = { Waiting: [30, 60], CheckedIn: [15, 30], Examining: [30, 45], labs: [30, 60], Prescribed: [10, 20] }
// Ca cờ đỏ theo kết quả lượt khám (outcome của liveRedFlags): [lớp badge, nhãn].
const FLAG_BADGE = { referred: ['b-danger', 'Transferred — doctors alerted'], seen: ['b-success', 'Seen at the clinic'], queued: ['b-warning', 'Top of the queue (Emergency)'], left: ['b-warning', 'Left'] }

export default function QueueView({ readOnly, onPay }) {
  const { visits, redFlags } = useQueue()
  const now = useNow()
  const { showToast } = useToast()
  const [tab, setTab] = useState(ST.WAITING)
  const [editing, setEditing] = useState(null)
  const [cancelling, setCancelling] = useState(null)

  // Bệnh nhân vừa được tiếp đón: dòng sáng lên một nhịp.
  const fresh = useNewIds(visits.map((v) => v.id))
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

  const meta = (v) => [v.age !== '' ? v.age + ' ' + translate('yrs') : null, translate(v.gender)].filter(Boolean).join(' · ')

  // Nút thao tác gọn trên từng dòng (giữ đúng các việc như trước).
  const iconBtn = (icon, title, onClick, disabled) => (
    <button className="btn btn-ghost btn-icon" title={translate(title)} aria-label={translate(title)} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
    </button>
  )
  function rowActions(v) {
    if (isIntakeOpen(v) || atLabs(v)) return null
    if (v.status === ST.WAITING || v.status === ST.CHECKED_IN)
      return (
        <>
          {v.status === ST.WAITING && (
            <button className="btn btn-outline btn-sm" disabled={readOnly} onClick={() => checkIn(v)} title={translate('The patient is at the desk and it is nearly their turn')}>
              <Icon name="log-in" />
              {translate('Mark present — check in')}
            </button>
          )}
          {iconBtn('pencil', v.status === ST.WAITING ? 'Re-measure vitals, flag as priority or report warning signs' : 'Re-measure vitals', () => setEditing(v), readOnly)}
          {iconBtn('printer', 'Print queue ticket', () => printTicket(v))}
          {iconBtn('x-circle', 'Patient left before being called, or checked in by mistake', () => setCancelling(v), readOnly)}
        </>
      )
    if (v.status === ST.PRESCRIBED)
      return (
        <button className="btn btn-outline btn-sm" disabled={readOnly} onClick={() => onPay(v)}>
          <Icon name="package" />
          {translate('Dispense & collect')}
        </button>
      )
    return null
  }
  const emergency = (v) => v.triage === 'emergency' && [ST.WAITING, ST.CHECKED_IN].includes(v.status)
  const prioOf = (v) =>
    emergency(v) ? (
      <span className="badge b-danger">{translate('Emergency')}</span>
    ) : v.priority && v.status !== ST.FINISHED ? (
      <span className="badge b-warning">{translate('Priority')}</span>
    ) : (
      <span className="plain">{translate('Routine')}</span>
    )
  const rowTone = (v) => (emergency(v) ? 'pr-danger' : v.priority && v.status !== ST.FINISHED ? 'pr-warning' : 'pr-routine')
  // Bước / bác sĩ: đang được mời / đang khám màu xanh; chờ lâu vàng → đỏ; còn lại chữ thường.
  const stepOf = (v, w) => {
    const cls = isInvited(v) || v.status === ST.EXAMINING ? 'b-info' : w.level === 'long' ? 'b-danger' : w.level === 'warn' ? 'b-warning' : null
    return cls ? <span className={'badge ' + cls}>{w.label}</span> : <span className="plain">{w.label}</span>
  }

  return (
    <>
      <CallPanel readOnly={readOnly} variant="banner" />
      <div className="card">
        <div className="card-h">
          <h3>Today’s queue</h3>
          <div className="seg">
            {STATUSES.map((s) => (
              <button key={s.key} className={tab === s.key ? 'on' : ''} onClick={() => setTab(s.key)}>
                {translate(s.label)}
                <span className="c">{byStatus(s.key).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card-b">
          <div className="tbl-wrap">
            {list.length ? (
              <table>
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Patient</th>
                    <th>Priority</th>
                    <th>Vital signs</th>
                    <th>Reason</th>
                    <th>Step / doctor</th>
                    <th className="r" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((v) => {
                    const w = waitOf(v)
                    return (
                      <tr key={v.id} className={rowTone(v) + (isIntakeOpen(v) || [ST.FINISHED, ST.CANCELLED].includes(v.status) ? ' dim' : '') + (fresh.has(v.id) ? ' row-new' : '')}>
                        <td className="r num">
                          <b style={{ fontSize: 'var(--fs-md)' }} title={translate('Arrival time') + ' ' + hhmm(v.arrivedAt)}>
                            {String(v.ticket).padStart(3, '0')}
                          </b>
                          <div className="muted small">{hhmm(v.arrivedAt)}</div>
                        </td>
                        <td>
                          <div className="who-cell">
                            <div style={{ minWidth: 0, maxWidth: 180 }}>
                              <b className="clip" title={translate('Patient ID') + ': ' + v.patientId}>
                                {v.name}
                              </b>
                              <span>{meta(v)}</span>
                              <PatientAlerts p={v} compact />
                              {v.carriedFrom && (
                                <span className="badge b-warning">
                                  {translate('Unpaid from')} {dmy(v.carriedFrom + 'T00:00:00')}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>{prioOf(v)}</td>
                        <td style={{ maxWidth: 130 }}>
                          <div className="vit">{v.status !== ST.FINISHED && v.status !== ST.PRESCRIBED ? vitalsText(v.vitals) : '—'}</div>
                        </td>
                        <td style={{ maxWidth: 120 }}>
                          <Clip className="muted" title={translate('Reason for visit') + ' — ' + v.name}>
                            {translate(v.reason) || '—'}
                          </Clip>
                        </td>
                        <td>
                          {stepOf(v, w)}
                          {v.doctor && <div className="muted small">{v.doctor + (v.room ? ' · ' + v.room : '')}</div>}
                          {v.left && <div className="muted small">{translate(leftReasonLabel(v.left.reason)) + (v.left.note ? ' — ' + v.left.note : '')}</div>}
                        </td>
                        <td>
                          <div className="acts">{rowActions(v)}</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty">
                <div className="ill">
                  <Icon name="inbox" />
                </div>
                <b>No patients in this step.</b>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>
            <Icon name="siren" />
            Emergency cases
          </h3>
          <span className="plain">Transferred at once or placed at the top of the queue · doctors are alerted</span>
        </div>
        <div className="card-b">
          <div className="tbl-wrap">
            {redFlags.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Signs</th>
                    <th>Time</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {redFlags.map((r) => (
                    <tr key={r.id} className="pr-danger">
                      <td>
                        <b style={{ fontWeight: 500 }}>{r.name}</b>
                        {r.by && <div className="muted small">{r.by}</div>}
                      </td>
                      <td className="muted" style={{ maxWidth: 560 }}>
                        <Clip lines={2} title={translate('Emergency signs') + ' — ' + r.name}>
                          {translate(r.signs) || '—'}
                        </Clip>
                      </td>
                      <td className="num muted">{hhmm(r.at)}</td>
                      <td>
                        {r.doctorReview ? (
                          <span className={'badge ' + (r.doctorReview.decision === 'referred' ? 'b-danger' : 'b-success')}>
                            {translate(r.doctorReview.decision === 'referred' ? 'Referred' : 'Seen at the clinic')} · {r.doctorReview.by}
                          </span>
                        ) : (
                          <span className={'badge ' + FLAG_BADGE[r.outcome][0]}>{translate(FLAG_BADGE[r.outcome][1])}</span>
                        )}
                        {isPendingFlag(r) && !r.ack && (
                          <div className="rf-todo">
                            <span className="muted small">
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
                              <button className="btn btn-danger btn-sm" disabled={readOnly} onClick={() => acknowledgeRedFlag(r.id)}>
                                {r.outcome === 'seen' ? translate('Done') : translate('Patient guided')}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">
                <div className="ill">
                  <Icon name="inbox" />
                </div>
                <b>No red-flag cases today.</b>
              </div>
            )}
          </div>
        </div>
      </div>
      {editing && <EditWaitingModal visit={editing} onClose={() => setEditing(null)} />}
      {cancelling && <CancelVisitModal visit={cancelling} onClose={() => setCancelling(null)} />}
    </>
  )
}
