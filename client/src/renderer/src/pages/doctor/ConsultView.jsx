import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { useQueue, waitingOrder, inRoom, isMine } from '../../api/queueStore'
import { useTakePatient, LeaveVisitModal } from './doctorShared'
import { ServerVisit } from './consult/ServerVisit'
import DoctorQueue, { useQueueGroups } from './consult/DoctorQueue'
import ConsultForm from './consult/ConsultForm'

// Màn Khám của bác sĩ: cột hàng đợi (consult/DoctorQueue) + phiếu khám người đang trong phòng (consult/ConsultForm).
export default function ConsultView({ visitId, onSelect }) {
  const { user } = useAuth()
  const { visits } = useQueue()
  const [openGroups, toggle] = useQueueGroups()
  const rail = openGroups._rail
  const [closing, setClosing] = useState(null)
  const { take, next, dialog } = useTakePatient(onSelect)
  const mine = visits.filter((v) => inRoom(v) && isMine(v, user))
  const current = visits.find((v) => v.id === visitId && inRoom(v) && isMine(v, user)) ?? mine[0] ?? null
  const nextRef = useRef(next)
  nextRef.current = next
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        nextRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={'doc-layout' + (rail ? ' q-rail' : '')}>
      <DoctorQueue visits={visits} user={user} mine={mine} current={current} onSelect={onSelect} take={take} next={next} onCloseLab={setClosing} openGroups={openGroups} toggle={toggle} />
      {current ? (
        <ServerVisit key={current.id} visit={current}>
          {(v) => <ConsultForm key={v.id} visit={v} user={user} onDone={() => onSelect(null)} onNext={next} />}
        </ServerVisit>
      ) : (
        <div className="card doc-empty">
          <div className="empty-state">
            <Icon name="stethoscope" />
            <b>No patient in your room</b>
            <span>Call the next patient, or pick someone from the queue on the left.</span>
            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={next} disabled={!waitingOrder(visits).length}>
              <Icon name="megaphone" /> Call next patient
            </button>
          </div>
        </div>
      )}
      {closing && <LeaveVisitModal visit={closing} onClose={() => setClosing(null)} onDone={() => setClosing(null)} />}
      {dialog}
    </div>
  )
}
