// ĐÂY LÀ LỚP GIẢ LẬP (demo) cho bảng doctor_duty — bác sĩ ĐANG TRỰC ở phòng nào, đang khám hay nghỉ giữa giờ.
// Phòng lấy từ Danh mục › Khoa phòng (mỗi khoa có phòng + danh sách bác sĩ được phân công).
// Bác sĩ "Bắt đầu ca" → chọn phòng (mặc định phòng được phân công); "Kết thúc ca" (doctorShiftStore) → rời trực.
// Lễ tân thấy ai đang trực, ở phòng nào, đang khám / trống / nghỉ để hướng bệnh nhân; lượt khám ghi lại phòng khám.
// Backend thật: GET /duty (realtime), POST /duty/start, PATCH /duty/break, DELETE /duty.
import { useSyncExternalStore } from 'react'
import { logEvent } from './activityStore'
import { getCatalogs } from './catalogStore'

const KEY = 'medassist_doctor_duty_v1'
const today = () => new Date().toDateString()

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY))
    // Ca trực chỉ có hiệu lực trong ngày — sang ngày mới mọi người phải bắt đầu ca lại.
    return s?.day === today() ? s.list : []
  } catch {
    return []
  }
}
let duty = read()
const listeners = new Set()
function commit(next) {
  duty = next
  try {
    localStorage.setItem(KEY, JSON.stringify({ day: today(), list: duty }))
  } catch {
    /* chỉ giữ trong phiên */
  }
  listeners.forEach((fn) => fn())
}
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getDuty = () => duty
export function useDuty() {
  return useSyncExternalStore(subscribe, getDuty)
}
export const dutyOf = (user, list = duty) => list.find((x) => x.doctorId === user.id) ?? null

// Phòng khám đang hoạt động (từ Danh mục › Khoa phòng) và phòng được phân công cho bác sĩ này.
export function clinicRooms() {
  return (getCatalogs().departments ?? []).filter((d) => d.active !== false && d.room).map((d) => ({ code: d.code, dept: d.name, room: d.room, doctors: d.doctors ?? [] }))
}
export const assignedRoom = (user) => clinicRooms().find((r) => r.doctors.includes(user.name)) ?? null

export function startDuty(user, roomCode) {
  const r = clinicRooms().find((x) => x.code === roomCode)
  if (!r) return { ok: false, error: 'Choose a consultation room.' }
  const taken = duty.find((x) => x.room === r.room && x.doctorId !== user.id)
  if (taken) return { ok: false, error: 'This room is already taken by another doctor on duty.', by: taken.doctor }
  const rec = { doctorId: user.id, doctor: user.name, room: r.room, dept: r.dept, code: r.code, since: new Date().toISOString(), status: 'on', breakSince: null }
  commit([...duty.filter((x) => x.doctorId !== user.id), rec])
  logEvent(user, 'duty.start', { target: { kind: 'account', id: user.username, label: user.name }, params: { room: r.room, dept: r.dept } })
  return { ok: true, duty: rec }
}
// Nghỉ giữa giờ / làm tiếp. Lễ tân thấy "đang nghỉ" để không hướng bệnh nhân vào phòng đó.
export function setBreak(user, on) {
  const d = dutyOf(user)
  if (!d) return { ok: false, error: 'Start your shift first.' }
  commit(duty.map((x) => (x.doctorId === user.id ? { ...x, status: on ? 'break' : 'on', breakSince: on ? new Date().toISOString() : null } : x)))
  logEvent(user, on ? 'duty.break' : 'duty.resume', { target: { kind: 'account', id: user.username, label: user.name }, params: { room: d.room } })
  return { ok: true }
}
// Gọi từ doctorShiftStore khi kết thúc ca (không ghi nhật ký riêng — đã có nhật ký kết thúc ca).
export function endDuty(user) {
  if (dutyOf(user)) commit(duty.filter((x) => x.doctorId !== user.id))
}
