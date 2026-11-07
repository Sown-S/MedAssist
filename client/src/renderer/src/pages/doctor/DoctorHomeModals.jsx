import { useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { translate } from '../../i18n'
import { useQueue, minutesSince, isMine, labRows, atLabs, ST } from '../../api/queueStore'
import { dmy } from '../reception/shared'
import { PatientBrief, LabOrderResults } from './doctorShared'
import { fold } from '../../lib/format'

// Hộp thoại của trang chủ bác sĩ: danh sách chờ khám, bệnh nhân đang đi xét nghiệm.
export const no = (t) => String(t).padStart(3, '0')
export const waitTone = (n) => (n >= 45 ? 'long' : n >= 25 ? 'warn' : 'ok')

export function WaitingModal({ list, initial, now, past, onTake, onClose }) {
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

export function LabListModal({ onResume, onClose }) {
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
