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
import { ymd } from '../../utils/format'

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

  // Ô số liệu; chi tiết (người kế tiếp, đơn hôm nay/tuần…) nằm ở tooltip và ở các thẻ bên dưới.
  const tiles = [
    {
      tone: 'g',
      icon: 'users',
      title: 'Waiting for consultation',
      value: waiting.length,
      hint: ready[0] ? translate('Next') + ': ' + no(ready[0].ticket) + ' — ' + ready[0].name : waiting.length ? translate('Nobody checked in yet') : translate('No one is waiting.'),
      run: () => setWaitOpen('')
    },
    { icon: 'door', title: 'In my room', value: mine.length, hint: mine[0] ? mine[0].name : translate('No patient in your room'), run: () => go('consult', mine[0]?.id) },
    { icon: 'flask', title: 'Lab tests', value: labs.length, hint: `${labs.length} ${translate('patients out for lab tests')}`, run: () => setLabOpen(true) },
    {
      icon: 'fileText',
      title: 'My prescriptions',
      value: rxWeek,
      hint: `${rxToday.length} ${translate('prescriptions today')} · ${rxWeek} ${translate('prescriptions this week')}`,
      run: () => go('prescriptions')
    },
    { icon: 'pill', title: 'Drug cabinet', value: inv.drugs.filter((d) => d.active && d.kind === 'drug').length, run: () => go('drugs') },
    {
      tone: lowStock ? 'r' : '',
      icon: 'package',
      title: 'Drugs low or out of stock',
      value: lowStock,
      hint: lowStock ? `${lowStock} ${translate('drugs low or out of stock')}` : translate('All drugs in stock'),
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
    { icon: 'fileText', title: 'My prescriptions', sub: 'By day, week or month', run: () => go('prescriptions') },
    { icon: 'flask', title: 'Lab tests', sub: `${labs.length} ${translate('patients out for lab tests')}`, run: () => setLabOpen(true) }
  ]

  return (
    <>
      <div className="kpis k3 dk">
        {tiles.map((c) => (
          <button key={c.title} className={'tile rt ' + (c.tone || 'b') + (c.alert ? ' alert' : '')} onClick={c.run} title={c.hint}>
            <span className="tl">{translate(c.title)}</span>
            <span className="rt-b">
              <b className="rt-n val">{c.value}</b>
              <span className="chip">
                <Icon name={c.icon} />
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Control panel</div>
        <div className="quick q4 qrow">
          {actions.map((a) => (
            <button key={a.title} className="qa qv" onClick={a.run}>
              <span className="ico">
                <Icon name={a.icon} />
              </span>
              <span>
                <b>{translate(a.title)}</b>
                <small>{translate(a.sub)}</small>
              </span>
              <Icon name="arrowUpRight" className="qa-go" />
            </button>
          ))}
        </div>
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
