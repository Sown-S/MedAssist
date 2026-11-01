import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { useQueue, waitingOrder, minutesSince, ST, checkInVisit, invitesOf, dropInvite } from '../../api/queueStore'
import { ticketNo } from '../../components/queuePrint'
import { callText } from '../../components/useCallAnnouncer'
import { useDevice } from '../../api/deviceSettings'

// Bảng gọi bệnh nhân ở quầy. Bác sĩ chỉ mời (call-next); bệnh nhân chưa check-in thì check-in rồi mời vào;
// không có mặt → bỏ lời mời (DELETE /visits/{id}/call), bệnh nhân giữ chỗ.
export default function CallPanel({ readOnly }) {
  const { showToast } = useToast()
  const { visits } = useQueue()
  const dev = useDevice().queue
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [])
  const toCall = invitesOf(visits).map((v) => ({ ...v, room: v.calledRoom, doctor: v.calledByName }))
  const next = waitingOrder(visits)

  async function checkIn(v) {
    const r = await checkInVisit(v.id)
    showToast(r.ok ? ticketNo(v.ticket) + ' — ' + translate('checked in') : translate(r.error), r.ok ? 'ok' : 'error')
  }
  async function notHere(v) {
    const r = await dropInvite(v.id)
    showToast(r.ok ? translate('Invitation cancelled — the patient keeps their place in the queue') + ' — ' + ticketNo(v.ticket) : translate(r.error), r.ok ? 'ok' : 'error')
  }

  return (
    <div className="card call-panel">
      <div className="card-title">
        <Icon name="megaphone" /> Patients to call in
      </div>
      {toCall.length ? (
        toCall.map((v) => (
          <div key={v.id} className="call-now">
            <span className="num">{ticketNo(v.ticket)}</span>
            <span style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column' }}>
              <span className="nm">
                {dev.showNames ? v.name + ' → ' : '→ '}
                {v.room || '—'}
              </span>
              <span className="lbl">
                {v.doctor} · {translate('ready')} {minutesSince(v.calledAt ?? v.statusAt)} {translate('min ago')} · <i>“{callText(v)}”</i>
              </span>
            </span>
            {v.status === ST.WAITING && (
              <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => checkIn(v)} title={translate('The patient is at the desk and it is nearly their turn')}>
                <Icon name="check" /> {translate('Mark present')}
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              disabled={readOnly}
              onClick={() => notHere(v)}
              title={translate('Cancels the invitation — the patient keeps their place in the queue')}
            >
              <Icon name="x" /> Not here
            </button>
          </div>
        ))
      ) : (
        <div className="call-now">
          <span className="lbl">No one to call right now — when a doctor is ready for the next patient, they appear here with the room.</span>
        </div>
      )}
      {next.length > 0 && (
        <div className="call-next">
          <span className="lbl">Next in the queue</span>
          {next.slice(0, dev.nextCount).map((v) => {
            const cls = 'call-chip' + (v.absent ? ' absent' : '') + (v.priority ? ' prio' : '') + (v.triage === 'emergency' ? ' emerg' : '') + (v.status === ST.CHECKED_IN ? ' ready' : ' pending')
            const tip = (dev.showNames ? v.name + ' · ' : '') + translate(v.status === ST.CHECKED_IN ? 'Checked in — can be called' : 'Not checked in — click when the patient is at the desk')
            return v.status === ST.WAITING ? (
              <button key={v.id} type="button" className={cls} title={tip} disabled={readOnly} onClick={() => checkIn(v)}>
                {ticketNo(v.ticket)}
              </button>
            ) : (
              <span key={v.id} className={cls} title={tip}>
                <Icon name="check" /> {ticketNo(v.ticket)}
              </span>
            )
          })}
          {next.length > dev.nextCount && <span className="ai-soft">+{next.length - dev.nextCount}</span>}
        </div>
      )}
    </div>
  )
}
