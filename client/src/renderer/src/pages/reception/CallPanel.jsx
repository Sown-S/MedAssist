import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { translate } from '../../i18n'
import { useQueue, waitingOrder, confirmEntered, markNotPresent, minutesSince, ST, checkInVisit } from '../../api/queueStore'
import { ticketNo } from '../../components/queuePrint'
import { callText } from '../../components/useCallAnnouncer'
import { useDevice } from '../../api/deviceSettings'

// Bảng gọi bệnh nhân ở quầy Lễ tân (máy trạng thái backend):
//  1. Tới lượt, bệnh nhân có mặt → lễ tân bấm số ở dải "Tiếp theo" để CHECK-IN (Waiting → CheckedIn);
//  2. Bác sĩ "Mời bệnh nhân tiếp theo" = start-exam người đã check-in đứng đầu (CheckedIn → Examining) → hiện ở đây kèm phòng;
//  3. Lễ tân GỌI MIỆNG ("Mời số X vào phòng Y") rồi bấm "Đã vào phòng"; không thấy bệnh nhân → "Không có mặt" (release, xuống cuối).
export default function CallPanel({ readOnly }) {
  const { showToast } = useToast()
  const { user } = useAuth()
  const { visits } = useQueue()
  const dev = useDevice().queue
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [])
  // Bệnh nhân bác sĩ đã nhận nhưng chưa vào phòng = lễ tân cần gọi.
  const toCall = visits.filter((v) => v.status === ST.EXAMINING && v.entered === false).sort((a, b) => (a.calledAt ?? '').localeCompare(b.calledAt ?? ''))
  const next = waitingOrder(visits)

  function cameIn(v) {
    confirmEntered(v.id)
    showToast(ticketNo(v.ticket) + ' — ' + translate('in the room'))
  }
  async function checkIn(v) {
    const r = await checkInVisit(v.id, user)
    showToast(r.ok ? ticketNo(v.ticket) + ' — ' + translate('checked in') : translate(r.error))
  }
  function notHere(v) {
    const r = markNotPresent(v.id, user)
    if (!r.ok) return showToast(translate(r.error))
    showToast(translate('Moved to the end of the queue') + ' — ' + ticketNo(v.ticket))
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
            <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => cameIn(v)}>
              <Icon name="check" /> In the room
            </button>
            <button className="btn btn-ghost btn-sm" disabled={readOnly} onClick={() => notHere(v)} title={translate('Moves this patient to the end of the queue')}>
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
