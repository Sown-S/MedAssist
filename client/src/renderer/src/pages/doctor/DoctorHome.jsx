import { useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { translate } from '../../i18n'
import { useQueue, waitingOrder, minutesSince, isMine, labRows, inRoom, atLabs, ST, readyOrder } from '../../api/queueStore'
import { usePrescriptions } from '../../api/prescriptionApi'
import { useInventory, stockOf } from '../../api/inventoryStore'
import { soldOutside } from '../../api/rxSafety'
import { fold } from '../../api/patient'
import { useNow, ymd, periodRange, dmy, hhmm } from '../reception/shared'
import { useTakePatient, pastVisitsOf, PatientBrief, LabOrderResults, InviteBar } from './doctorShared'

const no = (t) => String(t).padStart(3, '0')
const waitTone = (n) => (n >= 45 ? 'long' : n >= 25 ? 'warn' : 'ok')

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
  const lowStock = inv.drugs.filter((d) => d.active && d.kind === 'drug' && !soldOutside(d) && stockOf(d, inv.batches).statuses.some((s) => s === 'out' || s === 'low')).length

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
                {r.rx.length} {translate('drugs')}
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

function WaitingModal({ list, initial, now, past, onTake, onClose }) {
  const [open, setOpen] = useState(initial || list[0]?.id || null)
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Waiting for consultation') + ' · ' + list.length} onClose={onClose} />
      <div className="modal-body wait-list">
        {list.map((v) => {
          const n = minutesSince(v.statusAt, now)
          const on = open === v.id
          return (
            <div key={v.id} className={'wait-item' + (on ? ' open' : '')}>
              <button className="wait-head" onClick={() => setOpen(on ? null : v.id)}>
                <span className="p-ticket">{no(v.ticket)}</span>
                <span className="wait-main">
                  <b>{v.name}</b>
                  <small>
                    {translate(v.gender)}
                    {v.age !== '' && v.age != null ? ', ' + v.age + ' ' + translate('yrs') : ''} · {translate(v.reason)}
                  </small>
                </span>
                {v.triage === 'emergency' && <span className="badge low">{translate('Emergency')}</span>}
                {v.priority && v.triage !== 'emergency' && (
                  <span className="flag-priority">
                    <Icon name="zap" /> Priority
                  </span>
                )}
                {v.absent && <span className="badge muted">Absent</span>}
                {v.allergies && <span className="allergy-chip">Allergy</span>}
                <span className={'p-wait ' + waitTone(n)}>{n} min</span>
                <Icon name="chevronDown" />
              </button>
              <div className="collapse">
                <div>
                  {on && (
                    <div className="wait-body">
                      <PatientBrief v={v} past={past(v)} />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        {v.status === ST.CHECKED_IN ? (
                          <button className="btn btn-primary btn-sm" onClick={() => onTake(v)}>
                            <Icon name="megaphone" /> Call into the room
                          </button>
                        ) : (
                          <span className="ai-soft" style={{ fontSize: 12.5 }}>
                            {translate('Not checked in yet — reception checks the patient in when they are at the desk.')}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {!list.length && (
          <div className="empty-state">
            <Icon name="users" />
            <b>No one is waiting.</b>
            <span>Patients appear here as soon as reception checks them in.</span>
          </div>
        )}
      </div>
    </Modal>
  )
}

const LAB_FILTERS = [
  { key: '', label: 'All' },
  { key: 'out', label: 'Out for lab tests' },
  { key: 'pending', label: 'No result yet' },
  { key: 'done', label: 'Results entered' }
]

function LabListModal({ onResume, onClose }) {
  const { user } = useAuth()
  const { visits } = useQueue()
  const [filter, setFilter] = useState('')
  const [q, setQ] = useState('')

  const all = visits
    .filter((v) => v.labOrders?.length && isMine(v, user))
    .map((v) => {
      const rows = v.labOrders.flatMap(labRows)
      const lastAt = v.labOrders.map((o) => o.at).sort().pop()
      const state = atLabs(v) && !v.day ? 'out' : rows.every((r) => r.result) || v.labResult ? 'done' : 'pending'
      return { v, rows, lastAt, state }
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
  const needle = fold(q)
  const list = all.filter(
    (x) => (!filter || x.state === filter || (filter === 'pending' && x.state === 'out')) && (!needle || fold([x.v.name, x.v.patientId, ...x.rows.map((r) => r.name)].join(' ')).includes(needle))
  )
  const STATE = { out: ['Out for lab tests', 'warn'], pending: ['No result yet', 'muted'], done: ['Results entered', 'ok'] }

  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Lab tests & results')} onClose={onClose} />
      <div className="modal-body">
        <div className="cash-filters" style={{ marginBottom: 12 }}>
          <div className="itabs" style={{ marginBottom: 0 }}>
            {LAB_FILTERS.map((f) => (
              <button key={f.key} className={'itab' + (filter === f.key ? ' active' : '')} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <input className="grow" type="search" placeholder="Search patient or test…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="lab-list">
          {list.map(({ v, state }) => (
            <div key={v.id + (v.day ?? '')} className="lab-list-item">
              <div className="lab-list-head">
                <span className="p-ticket">{no(v.ticket)}</span>
                <span className="wait-main">
                  <b>{v.name}</b>
                  <small>
                    <span className="mono">{v.patientId}</span>
                    {v.day ? ' · ' + dmy(v.labOrders[0].at) : ' · ' + translate('Today')}
                  </small>
                </span>
                <span className={'badge ' + STATE[state][1]}>{translate(STATE[state][0])}</span>
                {state === 'out' && (
                  <button className="btn btn-primary btn-sm" onClick={() => onResume(v)}>
                    Resume
                  </button>
                )}
              </div>
              {v.labOrders.map((o, i) => (
                <LabOrderResults key={o.id} order={o} summary={i === v.labOrders.length - 1 ? v.labResult : ''} />
              ))}
            </div>
          ))}
          {!list.length && (
            <div className="empty-state">
              <Icon name="flask" />
              <b>{all.length ? translate('No lab orders match the filters.') : translate('You have not ordered any lab tests yet.')}</b>
              <span>Lab orders appear here after you use “Order lab tests” in the consultation room.</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
