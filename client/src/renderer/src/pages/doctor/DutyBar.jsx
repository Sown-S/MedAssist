import { useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { useCatalogs } from '../../api/catalogStore'
import { useDuty, dutyOf, clinicRooms, assignedRoom, startDuty, setBreak } from '../../api/dutyStore'
import { hhmm } from '../reception/shared'

// Trạng thái trực của bác sĩ trên thanh điều hướng: chưa bắt đầu ca → "Bắt đầu ca" (chọn phòng);
// đang trực → phòng + giờ bắt đầu + nút nghỉ giữa giờ / làm tiếp. Kết thúc ca dùng nút "Kết thúc ca" bên cạnh.
export default function DutyBar() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const list = useDuty()
  useCatalogs()
  const [picking, setPicking] = useState(false)
  const me = dutyOf(user, list)

  if (!me)
    return (
      <>
        <button className="duty-chip off" onClick={() => setPicking(true)} title={translate('Choose your consultation room so reception can direct patients')}>
          <Icon name="clock" /> <span>Not on duty</span> · <b>Start shift</b>
        </button>
        {picking && <RoomPicker list={list} onClose={() => setPicking(false)} />}
      </>
    )
  const onBreak = me.status === 'break'
  return (
    <span className={'duty-chip ' + (onBreak ? 'break' : 'on')}>
      <Icon name="stethoscope" />
      <b>{me.room}</b>
      <span className="ai-soft">
        {me.dept} · {translate('since')} {hhmm(me.since)}
      </span>
      <span className={'badge ' + (onBreak ? 'warn' : 'ok')}>{onBreak ? translate('On break') : translate('On duty')}</span>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => {
          const r = setBreak(user, !onBreak)
          if (!r.ok) return showToast(translate(r.error))
          showToast(onBreak ? 'Back on duty' : 'On break — reception sees your room as unavailable')
        }}
      >
        {onBreak ? 'Resume' : 'Take a break'}
      </button>
    </span>
  )
}

// onStarted: gọi sau khi bắt đầu ca thành công (VD bác sĩ bấm "Mời" khi chưa vào ca → chọn phòng xong thì mời luôn).
export function RoomPicker({ list, onClose, onStarted }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const rooms = clinicRooms()
  const [code, setCode] = useState(assignedRoom(user)?.code ?? rooms[0]?.code ?? '')
  function start() {
    const r = startDuty(user, code)
    if (!r.ok) return showToast(translate(r.error) + (r.by ? ' (' + r.by + ')' : ''))
    showToast(translate('Shift started in') + ' ' + r.duty.room)
    onClose()
    onStarted?.()
  }
  return (
    <Modal open onClose={onClose}>
      <ModalHeader title={translate('Start shift')} onClose={onClose} />
      <div className="modal-body">
        <p className="ai-soft" style={{ fontSize: 13, marginTop: 0 }}>
          Choose the room you are working in. Rooms and assigned doctors come from Admin › Catalogs › Departments.
        </p>
        <div className="room-list">
          {rooms.map((r) => {
            const taken = list.find((x) => x.room === r.room && x.doctorId !== user.id)
            return (
              <label key={r.code} className={'room-opt' + (code === r.code ? ' on' : '') + (taken ? ' taken' : '')}>
                <input type="radio" name="room" disabled={!!taken} checked={code === r.code} onChange={() => setCode(r.code)} />
                <b>{r.room}</b>
                <span>{r.dept}</span>
                <small className="ai-soft">
                  {taken ? translate('Taken by') + ' ' + taken.doctor : r.doctors.includes(user.name) ? translate('Your assigned room') : r.doctors.join(', ') || '—'}
                </small>
              </label>
            )
          })}
          {!rooms.length && <p className="ai-soft">No rooms in the Departments catalog — ask an administrator to add them.</p>}
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!code} onClick={start}>
          <Icon name="check" /> Start shift
        </button>
      </div>
    </Modal>
  )
}
