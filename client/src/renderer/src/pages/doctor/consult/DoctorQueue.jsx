import { useState } from 'react'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { waitingOrder, readyOrder, ST, inRoom, atLabs, minutesSince, isMine } from '../../../api/queueStore'
import { useNow, hhmm } from '../../reception/shared'
import { InviteBar } from '../doctorShared'

// Cột hàng đợi chia nhóm, thu gọn được; trạng thái nhớ theo máy.
const GROUPS_KEY = 'medassist_doc_queue_groups'
const DEFAULT_OPEN = { mine: true, labs: true, waiting: true, done: false, other: false, _rail: false }
function readOpen() {
  try {
    return { ...DEFAULT_OPEN, ...JSON.parse(localStorage.getItem(GROUPS_KEY)) }
  } catch {
    return DEFAULT_OPEN
  }
}
const GROUP_ICON = { mine: 'stethoscope', labs: 'flask', waiting: 'users', done: 'check', other: 'user' }

// Nhóm nào đang mở (và _rail: thu cả cột thành dải icon) — ConsultView cũng cần _rail cho khung ngoài.
export function useQueueGroups() {
  const [openGroups, setOpenGroups] = useState(readOpen)
  function toggle(key) {
    const nextOpen = { ...openGroups, [key]: !openGroups[key] }
    setOpenGroups(nextOpen)
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(nextOpen))
    } catch {/* không lưu được thì chỉ nhớ trong phiên */}
  }
  return [openGroups, toggle]
}

// Cột hàng đợi bên trái màn Khám: các nhóm thu gọn được, hoặc thu thành dải icon (rail).
export default function DoctorQueue({ visits, user, mine, current, onSelect, take, next, onCloseLab, openGroups, toggle }) {
  const now = useNow()
  const groups = [
    { key: 'mine', title: 'In my room', list: mine },
    // Chỉ người mình chỉ định — bệnh nhân vẫn thuộc bác sĩ đó trong lúc đi xét nghiệm, bác sĩ khác không nhận được.
    { key: 'labs', title: 'Out for lab tests', list: visits.filter((v) => atLabs(v) && isMine(v, user)) },
    // Người đã check-in (mời được) đứng trước người chưa check-in.
    { key: 'waiting', title: 'Waiting', list: [...readyOrder(visits), ...waitingOrder(visits).filter((v) => v.status === ST.WAITING)] },
    {
      key: 'done',
      title: 'Done today',
      list: visits.filter((v) => (v.status === ST.PRESCRIBED || v.status === ST.FINISHED) && isMine(v, user)).sort((a, b) => b.statusAt.localeCompare(a.statusAt))
    },
    { key: 'other', title: 'With other doctors', list: visits.filter((v) => inRoom(v) && !isMine(v, user)) }
  ]

  function onItem(g, v) {
    if (g.key === 'mine') return onSelect(v.id)
  }

  const rail = openGroups._rail
  return (
    <>
      {rail ? (
        <div className="card dq-rail">
          <button className="icon-btn" onClick={() => toggle('_rail')} title={translate('Show the queue')}>
            <Icon name="chevronsRight" />
          </button>
          <button className="icon-btn primary" onClick={next} title={translate('Call next patient') + ' (Alt+N)'}>
            <Icon name="megaphone" />
          </button>
          {groups.slice(0, 3).map((g) => (
            <button key={g.key} className="dq-rail-cnt" onClick={() => toggle('_rail')} title={translate(g.title)}>
              <Icon name={GROUP_ICON[g.key]} />
              <b>{g.list.length}</b>
            </button>
          ))}
        </div>
      ) : (
        <div className="card dq">
          <div className="dq-top">
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={next} title="Alt+N">
              <Icon name="megaphone" /> Call next patient
            </button>
            <button className="icon-btn" onClick={() => toggle('_rail')} title={translate('Collapse the queue')}>
              <Icon name="chevronsLeft" />
            </button>
          </div>
          <InviteBar compact onStart={take} />
          {mine.length > 0 && <p className="dq-note">Finish or send the current patient for lab tests before calling the next one.</p>}
          {groups.map((g) => {
            const on = openGroups[g.key]
            return (
              <div key={g.key} className={'dq-group' + (on ? ' open' : '')}>
                <button className="dq-h" onClick={() => toggle(g.key)} aria-expanded={on}>
                  <span>{g.title}</span> <span className="cnt">{g.list.length}</span>
                  <Icon name="chevronDown" />
                </button>
                <div className="collapse">
                  <div>
                    {g.list.map((v) => {
                      const n = minutesSince(v.statusAt, now)
                      const active = current?.id === v.id
                      const clickable = g.key === 'mine' || (g.key === 'done' && v.rx.length > 0)
                      return (
                        <div
                          key={v.id}
                          className={'dq-item' + (active ? ' active' : '') + (g.key === 'other' ? ' muted' : '') + (g.key === 'done' ? ' done' : '') + (clickable ? '' : ' static')}
                          onClick={() => onItem(g, v)}
                          title={g.key === 'done' && v.rx.length ? translate('View & review the prescription') : undefined}
                        >
                          <span className="dq-no">{String(v.ticket).padStart(3, '0')}</span>
                          <div className="dq-main">
                            <b>{v.name}</b>
                            <small>
                              {g.key === 'done' ? (
                                v.diagnosis || '—'
                              ) : (
                                <>
                                  {translate(v.gender)}
                                  {v.age !== '' ? ', ' + v.age : ''} · {translate(v.reason)}
                                </>
                              )}
                            </small>
                            <span className="dq-tags">
                              {v.triage === 'emergency' && g.key !== 'done' && <span className="badge low">{translate('Emergency')}</span>}
                              {v.priority && v.triage !== 'emergency' && g.key !== 'done' && <span className="dot warn" title={translate('Priority')} />}
                              {v.allergies && <span className="dot danger" title={translate('Allergy') + ': ' + translate(v.allergies)} />}
                              {g.key === 'labs' && v.labReturnedAt && (
                                <span className="dq-back">
                                  <Icon name="flask" /> {translate('Back from lab')}
                                </span>
                              )}
                              {g.key === 'waiting' && v.status === ST.WAITING && <span className="badge muted">{translate('Not checked in')}</span>}
                              {v.released && g.key === 'waiting' && (
                                <span className="dq-handover" title={translate('Returned to the queue by') + ' ' + v.released.by}>
                                  <Icon name="repeat" /> {translate('Returned to queue')}
                                </span>
                              )}
                              {g.key === 'done' ? (
                                <span className="ai-soft">
                                  {hhmm(v.statusAt)} · {v.rx.length} {translate(v.rx.length === 1 ? 'drug' : 'drugs')}
                                </span>
                              ) : (
                                <span className={'p-wait ' + (n >= 45 ? 'long' : n >= 25 ? 'warn' : 'ok')}>{n} min</span>
                              )}
                              {(g.key === 'other' || (g.key === 'labs' && !isMine(v, user))) && <span className="ai-soft">{v.doctor}</span>}
                            </span>
                          </div>
                          {g.key === 'labs' && isMine(v, user) && !v.labReturnedAt && minutesSince(v.statusAt, now) >= 60 && (
                            <button
                              className="icon-btn sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                onCloseLab(v)
                              }}
                              title={translate('Did not come back — close the visit')}
                            >
                              <Icon name="x" />
                            </button>
                          )}
                          {((g.key === 'waiting' && v.status === ST.CHECKED_IN) || (g.key === 'labs' && isMine(v, user))) && (
                            <button
                              className={'btn btn-sm ' + (v.labReturnedAt ? 'btn-primary' : 'btn-ghost')}
                              onClick={(e) => {
                                e.stopPropagation()
                                take(v)
                              }}
                              title={translate('Call into the room')}
                            >
                              {g.key === 'labs' ? 'Resume' : 'Call in'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {!g.list.length && <p className="dq-empty">{translate('No one here.')}</p>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
