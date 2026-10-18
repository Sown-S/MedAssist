import Icon from './Icon'
import { translate } from '../i18n'
import { useDuty } from '../api/dutyStore'
import { useQueue, inRoom } from '../api/queueStore'
import { hhmm } from '../pages/reception/shared'

// Bác sĩ đang trực (cho Lễ tân / Quản trị viên): phòng, khoa, đang khám ai / trống / nghỉ giữa giờ — để hướng bệnh nhân đúng phòng.
export default function DutyBoard() {
  const duty = useDuty()
  const { visits } = useQueue()
  const rows = [...duty].sort((a, b) => a.room.localeCompare(b.room))
  return (
    <div className="card">
      <div className="card-title">
        <Icon name="stethoscope" /> Doctors on duty <span className="cnt">{rows.length}</span>
      </div>
      {rows.map((d) => {
        const seeing = visits.find((v) => inRoom(v) && v.doctorId === d.doctorId)
        const state = d.status === 'break' ? ['On break', 'warn'] : seeing ? ['Seeing a patient', 'info'] : ['Available', 'ok']
        return (
          <div key={d.doctorId} className="pay-row">
            <span className="mono t">{d.room}</span>
            <span className="nm">
              <b>{d.doctor}</b>
              <small>
                {d.dept} · {translate('since')} {hhmm(d.since)}
                {seeing ? ' · ' + String(seeing.ticket).padStart(3, '0') + ' ' + seeing.name : ''}
              </small>
            </span>
            <span className={'badge ' + state[1]}>{translate(state[0])}</span>
          </div>
        )
      })}
      {!rows.length && <p className="ai-soft" style={{ fontSize: 13.5 }}>No doctor has started a shift yet.</p>}
    </div>
  )
}
