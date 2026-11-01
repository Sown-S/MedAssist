// Phòng khám cố định của bác sĩ (ERD v1.9). Mỗi phòng khám tối đa một bác sĩ đang hoạt động; bác sĩ được gắn phòng
// ở Tài khoản nhân viên. Không xoá phòng, chỉ ngừng dùng; không đổi mã và loại phòng.
import { apiGet, apiPost, apiRequest, ApiError } from './client'

export const ROOM_TYPES = { Exam: 'Consultation room', Lab: 'Lab room' }

const fromServer = (r) => ({
  id: r.room_id,
  code: r.code,
  name: r.name,
  type: r.room_type,
  active: r.is_active,
  physician: r.physician ? { id: r.physician.user_id, name: r.physician.full_name } : null,
  updatedAt: r.updated_at
})

const ERRORS = {
  ROOM_CODE_TAKEN: 'This room code already exists.',
  ROOM_IN_USE: 'A doctor still works in this room — move the doctor to another room first.'
}
const apiError = (e) =>
  e instanceof ApiError ? (ERRORS[e.code] ?? e.details?.[0]?.message ?? e.message) : 'Cannot reach the clinic server. Check the server address and the network connection.'

export const listRooms = async ({ includeInactive = false } = {}) =>
  (await apiGet(`/api/v1/rooms${includeInactive ? '?include_inactive=true' : ''}`)).map(fromServer)
export const examRooms = (list) => list.filter((r) => r.type === 'Exam' && r.active)

export async function createRoom({ code, name, type = 'Exam' }) {
  const c = code.trim()
  const n = name.trim()
  if (!c || !n) return { ok: false, error: 'Enter the room code and name.' }
  try {
    return { ok: true, room: fromServer(await apiPost('/api/v1/admin/rooms', { code: c, name: n, room_type: type })) }
  } catch (e) {
    return { ok: false, error: apiError(e) }
  }
}
// Server tự chặn ngừng dùng phòng còn bác sĩ (ROOM_IN_USE).
export async function updateRoom(id, { name, active }) {
  const body = {}
  if (name !== undefined) body.name = name.trim()
  if (active !== undefined) body.is_active = active
  if (body.name === '') return { ok: false, error: 'Enter the room code and name.' }
  try {
    return { ok: true, room: fromServer(await apiRequest(`/api/v1/admin/rooms/${id}`, 'PATCH', body)) }
  } catch (e) {
    return { ok: false, error: apiError(e) }
  }
}
