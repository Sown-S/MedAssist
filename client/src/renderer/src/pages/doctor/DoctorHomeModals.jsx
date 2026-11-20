import { Fragment, useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { translate } from '../../i18n'
import { useQueue, minutesSince, isMine, labRows, atLabs, ST } from '../../api/queueStore'
import { PatientBrief, LabOrderResults } from './doctorShared'
import { fold, dmy } from '../../utils/format'
import Clip from '../../components/Clip'

// Hộp thoại của trang chủ bác sĩ: danh sách chờ khám, bệnh nhân đang đi xét nghiệm.
export const no = (t) => String(t).padStart(3, '0')
export const waitTone = (n) => (n >= 45 ? 'long' : n >= 25 ? 'warn' : 'ok')

export function WaitingModal({ list, initial, now, past, onTake, onClose }) {
  const [open, setOpen] = useState(initial || null)
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Waiting for consultation') + ' · ' + list.length} onClose={onClose} />
      <div className="modal-b">
        {list.length ? (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>{translate('No.')}</th>
                  <th>{translate('Patient')}</th>
                  <th>{translate('Reason for visit')}</th>
                  <th className="r">{translate('Waiting')}</th>
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {list.map((v) => {
                  const n = minutesSince(v.statusAt, now)
                  const on = open === v.id
                  const pr = v.triage === 'emergency' ? 'emergency' : v.priority ? 'priority' : 'routine'
                  return (
                    <Fragment key={v.id}>
                      <tr className={'pr-' + ({ emergency: 'danger', priority: 'warning' }[pr] ?? 'routine')}>
                        <td className="num">
                          <b>{no(v.ticket)}</b>
                        </td>
                        <td>
                          <b className="fw-500">{v.name}</b> {pr === 'emergency' && <span className="badge b-danger">{translate('Emergency')}</span>}
                          {pr === 'priority' && <span className="badge b-warning">{translate('Priority')}</span>} {v.absent && <span className="badge b-neutral">{translate('Absent')}</span>}
                          <div className="muted small">
                            {translate(v.gender)}
                            {v.age !== '' && v.age != null ? ', ' + v.age + ' ' + translate('yrs') : ''}
                            {v.allergies && (
                              <>
                                {' · '}
                                <span className="allergy">{translate('Allergy')}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="muted maxw-240">
                          <Clip title={translate('Reason for visit') + ' — ' + v.name}>{translate(v.reason)}</Clip>
                        </td>
                        <td className="r">
                          <span className={'badge ' + (n >= 45 ? 'b-danger' : n >= 25 ? 'b-warning' : 'b-neutral')}>
                            {n} {translate('min')}
                          </span>
                        </td>
                        <td>
                          <div className="acts">
                            <button className="btn btn-ghost btn-sm" aria-expanded={on} onClick={() => setOpen(on ? null : v.id)}>
                              {translate(on ? 'Hide' : 'Details')}
                            </button>
                            {v.status === ST.CHECKED_IN && (
                              <button className="btn btn-primary btn-sm" onClick={() => onTake(v)}>
                                {translate('Call into the room')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {on && (
                        <tr className="sub-row">
                          <td colSpan={5}>
                            <PatientBrief v={v} past={past(v)} />
                            {v.status !== ST.CHECKED_IN && <p className="muted small" style={{ margin: '10px 0 0' }}>{translate('Not checked in yet — reception checks the patient in when they are at the desk.')}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <div className="ill">
              <Icon name="coffee" />
            </div>
            <b>{translate('No one is waiting.')}</b>
            <span>{translate('Patients appear here as soon as reception checks them in.')}</span>
          </div>
        )}
      </div>
      <div className="modal-f">
        <span className="sp" />
        <button className="btn btn-outline" onClick={onClose}>
          {translate('Close')}
        </button>
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
  const [open, setOpen] = useState(null)

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
  const STATE = { out: ['Out for lab tests', 'b-warning'], pending: ['No result yet', 'b-neutral'], done: ['Results entered', 'b-info'] }

  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Lab tests & results')} onClose={onClose} />
      <div className="modal-b">
        <div className="toolbar mb-12">
          <div className="seg">
            {LAB_FILTERS.map((f) => (
              <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>
                {translate(f.label)}
              </button>
            ))}
          </div>
          <div className="search">
            <Icon name="search" />
            <input className="input" type="search" placeholder={translate('Search patient or test…')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {list.length ? (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>{translate('Patient')}</th>
                  <th>{translate('Tests')}</th>
                  <th>{translate('Result')}</th>
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {list.map(({ v, rows, state }) => {
                  const k = v.id + (v.day ?? '')
                  const on = open === k
                  return (
                    <Fragment key={k}>
                      <tr>
                        <td>
                          <b className="fw-500">{v.name}</b>
                          <div className="muted small">
                            <span className="num">{no(v.ticket)}</span> · <span className="num">{v.patientId}</span>
                            {v.day ? ' · ' + dmy(v.labOrders[0].at) : ' · ' + translate('Today')}
                          </div>
                        </td>
                        <td className="maxw-260">
                          <Clip title={translate('Tests') + ' — ' + v.name}>{rows.map((r) => r.name).join(', ')}</Clip>
                        </td>
                        <td>
                          <span className={'badge ' + STATE[state][1]}>{translate(STATE[state][0])}</span>
                        </td>
                        <td>
                          <div className="acts">
                            <button className="btn btn-ghost btn-sm" aria-expanded={on} onClick={() => setOpen(on ? null : k)}>
                              {translate(on ? 'Hide' : 'Details')}
                            </button>
                            {state === 'out' && (
                              <button className="btn btn-outline btn-sm" onClick={() => onResume(v)}>
                                {translate('Resume')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {on && (
                        <tr className="sub-row">
                          <td colSpan={4}>
                            {v.labOrders.map((o, i) => (
                              <LabOrderResults key={o.id} order={o} summary={i === v.labOrders.length - 1 ? v.labResult : ''} />
                            ))}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <div className="ill">
              <Icon name="flask" />
            </div>
            <b>{all.length ? translate('No lab orders match the filters.') : translate('You have not ordered any lab tests yet.')}</b>
            <span>{translate('Lab orders appear here after you use “Order lab tests” in the consultation room.')}</span>
          </div>
        )}
      </div>
      <div className="modal-f">
        <span className="sp" />
        <button className="btn btn-outline" onClick={onClose}>
          {translate('Close')}
        </button>
      </div>
    </Modal>
  )
}
