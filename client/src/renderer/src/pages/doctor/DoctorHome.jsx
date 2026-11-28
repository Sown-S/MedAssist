import { useState } from 'react'
import { HomeTile } from '../../components/StatCard'
import Icon from '../../components/Icon'
import HomeGreeting from '../../components/HomeGreeting'
import { useAuth } from '../../context/AuthContext'
import { translate } from '../../i18n'
import { useQueue, waitingOrder, minutesSince, isMine, inRoom, atLabs, ST, readyOrder } from '../../api/queueStore'
import { usePrescriptions } from '../../api/prescriptionApi'
import { useInventory, stockOf } from '../../api/inventoryStore'
import { useNow, periodRange, PAY_STATUS } from '../reception/shared'
import { useTakePatient, pastVisitsOf, InviteBar } from './doctorShared'
import { WaitingModal, LabListModal, no } from './DoctorHomeModals'
import { ymd, dmy, hhmm } from '../../utils/format'
import EmptyState from '../../components/ui/EmptyState'
import Badge from '../../components/ui/Badge'

export default function DoctorHome({ go }) {
  const { user } = useAuth()
  const { visits, loaded: queueLoaded, loadFailed } = useQueue()
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

  // Chưa có dữ liệu → undefined để ô hiện khung xương thay vì số 0; tải lỗi → “—”.
  const when = (ok, v, failed) => (ok ? v : failed ? '—' : undefined)
  // Ô số liệu; chi tiết (người kế tiếp, đơn hôm nay/tuần…) nằm ở tooltip và ở các thẻ bên dưới.
  const tiles = [
    {
      tone: 'g',
      icon: 'users',
      title: 'Waiting for consultation',
      value: when(queueLoaded, waiting.length, loadFailed),
      hint: ready[0] ? translate('Next') + ': ' + no(ready[0].ticket) + ' — ' + ready[0].name : waiting.length ? translate('Nobody checked in yet') : translate('No one is waiting.'),
      run: () => setWaitOpen('')
    },
    { tone: 'b', icon: 'door-open', title: 'In my room', value: when(queueLoaded, mine.length, loadFailed), hint: mine[0] ? mine[0].name : translate('No patient in your room'), run: () => go('consult', mine[0]?.id) },
    { tone: 'a', icon: 'flask-conical', title: 'Lab tests', value: when(queueLoaded, labs.length, loadFailed), hint: `${labs.length} ${translate('patients out for lab tests')}`, run: () => setLabOpen(true) },
    {
      tone: 'v',
      icon: 'file-text',
      title: 'My prescriptions',
      value: when(serverWeek.loaded, rxWeek, !!serverWeek.error),
      hint: `${rxToday.length} ${translate('prescriptions today')} · ${rxWeek} ${translate('prescriptions this week')}`,
      run: () => go('prescriptions')
    },
    {
      tone: 't',
      icon: 'pill',
      title: 'Drug cabinet',
      value: when(inv.loaded, inv.drugs.filter((d) => d.active && d.kind === 'drug').length),
      hint: lowStock ? `${lowStock} ${translate('drugs low or out of stock')}` : translate('All drugs in stock'),
      run: () => go('drugs')
    },
    {
      icon: 'stethoscope',
      title: 'Consultation room',
      value: user.room ? user.room.replace(/\D+/g, '') || user.room : '—',
      hint: user.room || translate('No room assigned — ask an administrator'),
      run: () => go('consult')
    }
  ]
  const actions = [
    { icon: 'stethoscope', title: 'Consultation room', sub: 'Examine, diagnose and prescribe', run: () => go('consult') },
    { icon: 'file-text', title: 'My prescriptions', sub: 'By day, week or month', run: () => go('prescriptions') },
    { icon: 'pill', title: 'Drug cabinet', sub: 'Stock, expiry dates and price of each drug', run: () => go('drugs') },
    { tone: 'a', icon: 'flask-conical', title: 'Lab tests', sub: `${labs.length} ${translate('patients out for lab tests')}`, run: () => setLabOpen(true) }
  ]
  const first = waiting[0]
  const callNext = (
    <button
      className="btn btn-primary"
      onClick={next}
      disabled={!waiting.length}
      title={translate(mine.length ? 'Finish or send the current patient for lab tests first' : 'Priority first, then by number')}
    >
      <Icon name="megaphone" />
      {translate('Call next patient')}
      <kbd>Alt+N</kbd>
    </button>
  )

  return (
    <>
      <HomeGreeting
        crumb="Doctor"
        name={user.name}
        extra={
          user.room && (
            <span className="gpill">
              <Icon name="stethoscope" />
              <span>{user.room}</span>
            </span>
          )
        }
      >
        <button className="btn btn-outline" onClick={() => go('consult')}>
          <Icon name="stethoscope" />
          {translate('Go to consultation room')}
        </button>
        {callNext}
      </HomeGreeting>

      <div className="grid-3 dk">
        {tiles.map((c) => (
          <HomeTile key={c.title} tone={c.tone || 'b'} icon={c.icon} label={c.title} value={c.value} sub={c.hint} alert={c.alert} title={c.hint} onClick={c.run} />
        ))}
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Control panel</h3>
        </div>
        <div className="card-b quick q4">
          {actions.map((a) => (
            <button key={a.title} className="qa qv" onClick={a.run}>
              <div className="ico p">
                <Icon name={a.icon} />
              </div>
              <div>
                <b>{translate(a.title)}</b>
                <span>{translate(a.sub)}</span>
              </div>
              <Icon name="arrow-up-right" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid-dk">
        <div className="card">
          <div className="card-h">
            <h3>Next in line</h3>
            <span className="plain">{translate('Priority first, then by number')}</span>
          </div>
          {first ? (
            <div className="next-card">
              <span className="no num">{no(first.ticket)}</span>
              <div className="grow minw-0 pointer" onClick={() => setWaitOpen(first.id)} title={translate('View the patient summary')}>
                <b className="fs-md">{first.name}</b>{' '}
                {first.triage === 'emergency' ? <Badge tone="danger">{translate('Emergency')}</Badge> : first.priority && <Badge tone="warning">{translate('Priority')}</Badge>}
                {first.status === ST.WAITING && <Badge tone="neutral">{translate('Not checked in')}</Badge>}
                <div className="muted small">
                  {[first.age !== '' ? first.age + ' ' + translate('yrs') : null, translate(first.gender), translate(first.reason)].filter(Boolean).join(' · ')} · {translate('waited')}{' '}
                  {minutesSince(first.statusAt, now)} {translate('min')}
                </div>
                {first.allergies && (
                  <span className="allergy">
                    <Icon name="triangle-alert" />
                    {translate('Allergy')} {translate(first.allergies)}
                  </span>
                )}
              </div>
              {callNext}
            </div>
          ) : (
            <EmptyState icon="coffee" title="No one is waiting." text="Patients appear here as soon as reception checks them in." />
          )}
          <div style={{ padding: '0 20px 16px' }}>
            <InviteBar onStart={take} />
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>My recent prescriptions</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => go('prescriptions')}>
              {translate('All prescriptions →')}
            </button>
          </div>
          <div className="card-b">
            <div className="tbl-wrap" tabIndex={0}>
              {recent.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Diagnosis</th>
                      <th>Medicines</th>
                      <th>Time</th>
                      <th>Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.slice(0, 6).map((r) => {
                      const st = PAY_STATUS[r.pay]
                      return (
                        <tr key={r.id} className="clickable" onClick={() => go('prescriptions')} title={translate('View & review the prescription')}>
                          <td>
                            <b className="fw-500">{r.name}</b>
                          </td>
                          <td className="muted">{r.diagnosis || '—'}</td>
                          <td>
                            {r.rx.length} {translate(r.rx.length === 1 ? 'drug' : 'drugs')}
                          </td>
                          <td className="num muted">{r.day === today ? hhmm(r.rxAt) : dmy(r.rxAt).slice(0, 5)}</td>
                          <td>{st ? st.cls ? <span className={'badge ' + st.cls}>{translate(st.label)}</span> : <span className="plain">{translate(st.label)}</span> : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <EmptyState icon="file-text" title="You have not finalized any prescriptions yet." />
              )}
            </div>
          </div>
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
