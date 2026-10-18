// ĐÂY LÀ LỚP GIẢ LẬP (demo) cho bảng doctor_shift_closes — bác sĩ KẾT THÚC CA KHÁM.
// Khác chốt ca của Lễ tân (đếm tiền két): bác sĩ không cầm tiền, nên kết thúc ca là bước BÀN GIAO —
// không còn bệnh nhân trong phòng / đang đi xét nghiệm mà không ai phụ trách, không còn ca cờ đỏ chưa đánh giá —
// kèm tổng kết ca (số lượt khám, đơn thuốc, chuyển tuyến, số lần kê dù cảnh báo nặng) để quản lý theo dõi chất lượng.
// Backend thật: GET /doctor-shifts?doctor=&from=, POST /doctor-shifts (server tự tính tổng kết, không tin client).
import { useSyncExternalStore } from 'react'
import { logEvent } from './activityStore'
import { getSettings } from './settingsStore'
import { getQueue, isMine, inRoom, atLabs } from './queueStore'
import { dutyOf, endDuty } from './dutyStore'

const KEY = 'medassist_doctor_shifts_v1'

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
let shifts = read() ?? []
const listeners = new Set()
function commit(next) {
  shifts = next
  try {
    localStorage.setItem(KEY, JSON.stringify(shifts))
  } catch {
    /* chỉ giữ trong phiên */
  }
  listeners.forEach((fn) => fn())
}
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getDoctorShifts = () => shifts
export function useDoctorShifts() {
  return useSyncExternalStore(subscribe, getDoctorShifts)
}

// Đầu ca: lần kết thúc ca gần nhất HÔM NAY của bác sĩ này; chưa có thì từ giờ mở cửa (Cài đặt › Vận hành).
// Lưu ý dữ liệu mẫu: lượt khám mẫu lùi giờ từ lúc mở app nên có thể nằm trước giờ mở cửa và không được tính.
export function doctorShiftStart(user, list = shifts) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dayStart = d.toISOString()
  const last = list.find((x) => x.doctorId === user.id && x.end > dayStart)
  // Đã "Bắt đầu ca" (chọn phòng) sau lần kết thúc ca gần nhất → tính từ lúc bắt đầu ca.
  const duty = dutyOf(user)
  if (duty && (!last || duty.since > last.end)) return duty.since
  if (last) return last.end
  const [h, m] = (getSettings().ops.open ?? '07:00').split(':').map(Number)
  d.setHours(h, m, 0, 0)
  // Làm trước giờ mở cửa (ca sớm / trực đêm) → tính từ đầu ngày, không để đầu ca nằm sau "bây giờ".
  return d.getTime() > Date.now() ? dayStart : d.toISOString()
}

// Việc còn dở + tổng kết từ đầu ca tới giờ (tính trên hàng chờ hôm nay).
export function shiftReview(user, since, { visits, redFlags } = getQueue()) {
  const after = (iso) => !!iso && iso >= since
  const finalized = visits.filter((v) => isMine(v, user) && after(v.finalizedAt))
  return {
    inRoom: visits.filter((v) => inRoom(v) && isMine(v, user)),
    labs: visits.filter((v) => atLabs(v) && isMine(v, user)),
    redFlags: redFlags.filter((r) => !r.doctorReview),
    summary: {
      visits: finalized.length,
      rx: finalized.filter((v) => v.rx.length).length,
      referred: redFlags.filter((r) => r.doctorReview?.byId === user.id && r.doctorReview.decision === 'referred' && after(r.doctorReview.at)).length,
      overrides: finalized.filter((v) => v.override).length,
      labs: visits.flatMap((v) => v.labOrders ?? []).filter((o) => o.by === user.name && after(o.at)).length
    }
  }
}

// Kết thúc ca: chỉ khi không còn việc dở. note: ghi chú cho ca sau / quản lý.
export function closeDoctorShift(user, note = '') {
  const start = doctorShiftStart(user)
  const r = shiftReview(user, start)
  if (r.inRoom.length || r.labs.length) return { ok: false, error: 'Finish or hand over every patient in your room or out for lab tests first.' }
  if (r.redFlags.length) return { ok: false, error: 'A red-flag case is still waiting for a doctor’s decision.' }
  const room = dutyOf(user)?.room ?? ''
  const rec = { id: 'DS' + Date.now(), doctorId: user.id, doctor: user.name, room, start, end: new Date().toISOString(), summary: r.summary, note: note.trim() }
  commit([rec, ...shifts])
  endDuty(user)
  logEvent(user, 'shift.doctor_close', { target: { kind: 'account', id: user.username, label: user.name }, params: { ...r.summary, note: rec.note } })
  return { ok: true, shift: rec }
}
