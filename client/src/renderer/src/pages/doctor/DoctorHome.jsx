import { useState } from 'react'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { translate } from '../../i18n'
import { useQueue, waitingOrder, minutesSince, isMine, inRoom, atLabs, ST, readyOrder } from '../../api/queueStore'
import { usePrescriptions } from '../../api/prescriptionApi'
import { useInventory, stockOf } from '../../api/inventoryStore'
import { useNow, periodRange, dmy, hhmm } from '../reception/shared'
import { useTakePatient, pastVisitsOf, InviteBar } from './doctorShared'
import { WaitingModal, LabListModal, no, waitTone } from './DoctorHomeModals'
import { ymd } from '../../lib/format'

export default function DoctorHome({ go }) {
  const { user } = useAuth()
  const { visits } = useQueue()
  const inv = useInventory()
  const now = useNow()
  const [waitOpen, setWaitOpen] = useState(null) // null = đóng; '' = mở; id = mở và bung sẵn người đó
  const [labOpen, setLabOpen] = useState(false)
  const { take, next, dialog } = useTakePatient((id) => go('consult', id))

  // Người đã check-in (mời được) trước, rồi người chưa check-in.
  const waiting = [...readyOrder(visits), ...waitingOrder(visits).filter((v) => v.status === ST.WAITING)]
  const ready = readyOrder(visits)
  const mine = visits.filter((v) => inRoom(v) && isMine(v, user))
  const labs = visits.filter((v) => atLabs(v) && isMine(v, user))
  const today = ymd(new Date())
  const week = periodRange('week')
  const serverWeek = usePrescriptions({ from: week[0], to: week[1], physicianId: user.id })
  const rxWeek = serverWeek.list.length
  // GET /queue không trả lượt đã khám xong, nên đếm đơn đã xác nhận hôm nay từ GET /prescriptions.
  const rxToday = serverWeek.list.filter((r) => ymd(new Date(r.at)) === today)
  const recent = serverWeek.list.map((r) => ({ ...r, day: ymd(new Date(r.at)), rxAt: r.at }))
  const lowStock = inv.drugs.filter((d) => d.active && d.kind === 'drug' && stockOf(d, inv.batches).statuses.some((s) => s === 'out' || s === 'low')).length

  const cards = [
    {
      tone: 'cyan',
      icon: 'users',
      title: 'Waiting for consultation',
      value: waiting.length,
      sub: ready[0] ? translate('Next') + ': ' + no(ready[0].ticket) + ' — ' + ready[0].name : waiting.length ? translate('Nobody checked in yet') : translate('No one is waiting.'),
      link: 'Click to see the waiting list →',
      run: () => setWaitOpen('')
    },
    {
      tone: 'green',
      icon: 'stethoscope',
      title: 'In my room',
      value: mine.length,
      sub: mine[0] ? mine[0].name : translate('No patient in your room'),
      link: mine[0] ? 'Click to continue the consultation →' : 'Click to open the consultation room →',
      run: () => go('consult', mine[0]?.id)
    },
    {
      tone: 'violet',
      icon: 'clipboard',
      title: 'My prescriptions',
      value: rxWeek,
      sub: `${rxToday.length} ${translate('prescriptions today')} · ${rxWeek} ${translate('prescriptions this week')}`,
      link: 'Click to view prescriptions →',
      run: () => go('prescriptions')
    },
    {
      tone: lowStock ? 'red' : 'cyan',
      icon: 'box',
      title: 'Drug cabinet',
      value: inv.drugs.filter((d) => d.active && d.kind === 'drug').length,
      sub: lowStock ? `${lowStock} ${translate('drugs low or out of stock')}` : translate('All drugs in stock'),
      link: 'Click to look up drugs →',
      run: () => go('drugs'),
      alert: lowStock > 0
    }
  ]
  const actions = [
    {
      icon: 'megaphone',
      title: 'Call next patient',
      sub: mine.length ? 'Finish or send the current patient for lab tests first' : 'Priority first, then by number',
      run: next
    },
    { icon: 'stethoscope', title: 'Consultation room', sub: 'Examine, diagnose and prescribe', run: () => go('consult') },
    { icon: 'clipboard', title: 'My prescriptions', sub: 'By day, week or month', run: () => go('prescriptions') },
    { icon: 'box', title: 'Drug cabinet', sub: 'Stock, expiry and price of each drug', run: () => go('drugs') },
    { icon: 'flask', title: 'Lab tests', sub: `${labs.length} ${translate('patients out for lab tests')}`, run: () => setLabOpen(true) }
  ]

  return (
    <>
      <div className="dash-cards">
        {cards.map((c) => (
          <button key={c.title} className={'dash-card ' + c.tone + (c.alert ? ' alert' : '')} onClick={c.run}>
            <span className="head">
              <Icon name={c.icon} /> {c.title}
            </span>
            <span className="val">{c.value}</span>
            <span className="sub">{c.sub}</span>
            <span className="link">{c.link}</span>
          </button>
        ))}
      </div>

      <h2 className="dash-h">Quick actions</h2>
      <div className="dash-actions">
        {actions.map((a) => (
          <button key={a.title} className="dash-action" onClick={a.run}>
            <Icon name={a.icon} />
            <span>
              <b>{a.title}</b>
              <small>{a.sub}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="dash-bottom">
        <div className="card">
          <div className="card-title">
            <Icon name="users" /> Next in line <span className="cnt">{waiting.length}</span>
          </div>
          {waiting.slice(0, 6).map((v) => {
            const n = minutesSince(v.statusAt, now)
            return (
              <div className="pay-row clickable" key={v.id} onClick={() => setWaitOpen(v.id)} title={translate('View the patient summary')}>
                <span className="mono t">{no(v.ticket)}</span>
                <span className="nm">
                  <b>{v.name}</b>
                  <small>{translate(v.reason)}</small>
                </span>
                {v.triage === 'emergency' && <span className="badge low">{translate('Emergency')}</span>}
                {v.priority && v.triage !== 'emergency' && (
                  <span className="flag-priority">
                    <Icon name="zap" /> Priority
                  </span>
                )}
                {v.allergies && <span className="allergy-chip">Allergy</span>}
                {v.status === ST.WAITING && <span className="badge muted">{translate('Not checked in')}</span>}
                <span className={'p-wait ' + waitTone(n)}>{n} min</span>
              </div>
            )
          })}
          {!waiting.length && <p className="ai-soft" style={{ fontSize: 14 }}>No one is waiting.</p>}
          <InviteBar onStart={take} />
          {/* Server mời cả người chưa check-in (lễ tân check-in khi họ đến quầy). */}
          <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={next} disabled={!waiting.length}>
            <Icon name="megaphone" /> Call next patient
          </button>
        </div>

        <div className="card">
          <div className="card-title">
            <Icon name="clipboard" /> My recent prescriptions <span className="cnt">{recent.length}</span>
          </div>
          {recent.slice(0, 6).map((r) => (
            <div className="pay-row clickable" key={r.id} onClick={() => go('prescriptions')} title={translate('View & review the prescription')}>
              <span className="mono t">{r.day === today ? hhmm(r.rxAt) : dmy(r.rxAt).slice(0, 5)}</span>
              <span className="nm">
                <b>{r.name}</b>
                <small>{r.diagnosis || r.rx.map((x) => x.name).join(', ')}</small>
              </span>
              <span className="ai-soft" style={{ fontSize: 12.5 }}>
                {r.rx.length} {translate(r.rx.length === 1 ? 'drug' : 'drugs')}
              </span>
            </div>
          ))}
          {!recent.length && <p className="ai-soft" style={{ fontSize: 14 }}>You have not finalized any prescriptions yet.</p>}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => go('prescriptions')}>
            All prescriptions →
          </button>
        </div>
      </div>

      {waitOpen !== null && (
        <WaitingModal
          list={waiting}
          initial={waitOpen}
          now={now}
          past={(v) => pastVisitsOf(v.patientId, { visits })}
          onTake={(v) => {
            setWaitOpen(null)
            take(v)
          }}
          onClose={() => setWaitOpen(null)}
        />
      )}
      {labOpen && <LabListModal onResume={(v) => (setLabOpen(false), take(v))} onClose={() => setLabOpen(false)} />}
      {dialog}
    </>
  )
}
