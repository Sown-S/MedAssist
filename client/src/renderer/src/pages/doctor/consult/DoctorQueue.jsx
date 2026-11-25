import { useState } from 'react'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { waitingOrder, readyOrder, ST, inRoom, atLabs, minutesSince, isMine } from '../../../api/queueStore'
import { useNow } from '../../reception/shared'
import { InviteBar } from '../doctorShared'
import useNewIds from '../../../hooks/useNewIds'
import { hhmm, todayVN } from '../../../utils/format'
import { usePrescriptions } from '../../../api/prescriptionApi'

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

// Nhóm nào đang mở (và _rail: thu cả cột thành dải icon) — ConsultView cũng cần _rail cho khung ngoài.
export function useQueueGroups() {
  const [openGroups, setOpenGroups] = useState(readOpen)
  function toggle(key) {
    const nextOpen = { ...openGroups, [key]: !openGroups[key] }
    setOpenGroups(nextOpen)
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(nextOpen))
    } catch {
      /* không lưu được thì chỉ nhớ trong phiên */
    }
  }
  return [openGroups, toggle]
}

// Cột hàng đợi bên trái màn Khám: các nhóm thu gọn được, hoặc thu thành dải icon (rail).
export default function DoctorQueue({ visits, user, mine, current, onSelect, take, next, onCloseLab, openGroups, toggle }) {
  const now = useNow()
  const fresh = useNewIds(visits.map((v) => v.id))
  // Nhóm “Xong hôm nay”: số thuốc lấy từ đơn đã chốt hôm nay của bác sĩ (GET /prescriptions), chỉ tải khi nhóm đang mở.
  const today = todayVN()
  const { list: myRx } = usePrescriptions({ from: today, to: today, physicianId: user?.id, enabled: !!openGroups.done && !!user?.id, ms: 30000 })
  const rxCount = new Map(myRx.map((r) => [r.visitId, r.rx.length]))
  const groups = [
    { key: 'mine', title: 'In my room', icon: 'stethoscope', list: mine },
    // Chỉ người mình chỉ định — bệnh nhân vẫn thuộc bác sĩ đó trong lúc đi xét nghiệm, bác sĩ khác không nhận được.
    { key: 'labs', title: 'Out for lab tests', icon: 'flask', list: visits.filter((v) => atLabs(v) && isMine(v, user)) },
    // Người đã check-in (mời được) đứng trước người chưa check-in.
    { key: 'waiting', title: 'Waiting', icon: 'users', list: [...readyOrder(visits), ...waitingOrder(visits).filter((v) => v.status === ST.WAITING)] },
    {
      key: 'done',
      title: 'Done today',
      icon: 'circle-check',
      list: visits.filter((v) => (v.status === ST.PRESCRIBED || v.status === ST.FINISHED) && isMine(v, user)).sort((a, b) => b.statusAt.localeCompare(a.statusAt))
    },
    { key: 'other', title: 'With other doctors', icon: 'door-open', list: visits.filter((v) => inRoom(v) && !isMine(v, user)) }
  ]

  function onItem(g, v) {
    if (g.key === 'mine') return onSelect(v.id)
  }
  const drugsOf = (v) => {
    const n = rxCount.get(v.id)
    return n === undefined ? '' : ' · ' + n + ' ' + translate(n === 1 ? 'drug' : 'drugs')
  }

  const rail = openGroups._rail
  const tone = (v, g) => (g.key === 'done' || g.key === 'other' ? 'routine' : v.triage === 'emergency' ? 'danger' : v.priority ? 'warning' : 'routine')
  return (
    <div className="card queue">
      <div className="qtop">
        <button className="btn btn-primary qinv" onClick={next} title={translate('Call next patient') + ' (Alt+N)'}>
          <Icon name="megaphone" />
          <span>{translate('Call next patient')}</span>
        </button>
        <button
          className="qcol-btn"
          onClick={() => toggle('_rail')}
          title={translate(rail ? 'Show the queue' : 'Collapse the queue')}
          aria-label={translate(rail ? 'Show the queue' : 'Collapse the queue')}
        >
          <Icon name="chevrons-left" />
        </button>
      </div>
      {!rail && (
        <>
          <div style={{ padding: '0 14px' }}>
            <InviteBar compact onStart={take} />
          </div>
          {mine.length > 0 && <p className="qwarn">{translate('Finish or send the current patient for lab tests before calling the next one.')}</p>}
        </>
      )}
      <div className="qacc">
        {groups.map((g) => {
          const on = openGroups[g.key]
          return (
            <div key={g.key} className={'qa-g' + (on ? ' open' : '')}>
              <button className="qa-h" onClick={() => toggle(g.key)} aria-expanded={!!on}>
                <Icon name={g.icon} className="qa-ic" />
                <span className="qa-t">{translate(g.title)}</span>
                <span className="cnt">{g.list.length}</span>
                <Icon name="chevron-right" />
              </button>
              <div className="qa-b">
                <div>
                  {g.list.map((v) => {
                    const n = minutesSince(v.statusAt, now)
                    const active = current?.id === v.id
                    const clickable = g.key === 'mine'
                    const t = tone(v, g)
                    return (
                      <div
                        key={v.id}
                        className={'qi' + (active ? ' on' : '') + (g.key === 'done' || g.key === 'other' ? ' dim' : '') + (fresh.has(v.id) ? ' row-new' : '')}
                        style={clickable ? undefined : { cursor: 'default' }}
                        tabIndex={clickable ? 0 : undefined}
                        onClick={() => onItem(g, v)}
                      >
                        <div className="pr" style={{ background: 'var(--' + t + ')' }} />
                        <div className="info">
                          <b className="clip">
                            {String(v.ticket).padStart(3, '0')} · <span>{v.name}</span>
                          </b>
                          <div className="meta">
                            {g.key === 'done' ? (
                              <>
                                {hhmm(v.statusAt)}
                                {drugsOf(v)}
                              </>
                            ) : (
                              <>
                                {v.age !== '' ? v.age + ' ' + translate('yrs') + ' · ' : ''}
                                {translate(v.gender)}
                                {t !== 'routine' && (
                                  <>
                                    {' · '}
                                    <span style={{ color: 'var(--' + t + ')', fontWeight: 600 }}>{translate(t === 'danger' ? 'Emergency' : 'Priority')}</span>
                                  </>
                                )}
                                {' · '}
                                {n} {translate('min')}
                              </>
                            )}
                          </div>
                          <div className="meta clip">
                            {g.key === 'labs' && v.labReturnedAt
                              ? translate('Results are ready — resume the visit')
                              : g.key === 'other' || (g.key === 'labs' && !isMine(v, user))
                                  ? v.doctor
                                  : translate(v.reason)}
                          </div>
                          {(v.allergies || (g.key === 'waiting' && v.status === ST.WAITING) || (v.released && g.key === 'waiting')) && (
                            <div className="meta">
                              {v.allergies && (
                                <span className="allergy" title={translate('Allergy') + ': ' + translate(v.allergies)}>
                                  <Icon name="triangle-alert" />
                                  {translate('Allergy')}
                                </span>
                              )}
                              {g.key === 'waiting' && v.status === ST.WAITING && <span> {translate('Not checked in')}</span>}
                              {v.released && g.key === 'waiting' && <span title={translate('Returned to the queue by') + ' ' + v.released.by}> · {translate('Returned to queue')}</span>}
                            </div>
                          )}
                        </div>
                        {g.key === 'labs' && isMine(v, user) && !v.labReturnedAt && minutesSince(v.statusAt, now) >= 60 && (
                          <button
                            className="btn btn-ghost btn-icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              onCloseLab(v)
                            }}
                            title={translate('Did not come back — close the visit')}
                            aria-label={translate('Did not come back — close the visit')}
                          >
                            <Icon name="x" />
                          </button>
                        )}
                        {((g.key === 'waiting' && v.status === ST.CHECKED_IN) || (g.key === 'labs' && isMine(v, user))) && (
                          <button
                            className={'btn btn-sm ' + (v.labReturnedAt ? 'btn-primary' : 'btn-outline')}
                            style={{ alignSelf: 'center' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              take(v)
                            }}
                            title={translate('Call into the room')}
                          >
                            {translate(g.key === 'labs' ? 'Resume' : 'Call in')}
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {!g.list.length && <div className="none">{translate('No one here.')}</div>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
