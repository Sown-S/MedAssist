// Phòng khám cố định của bác sĩ (bảng room, ERD v1.9) — thay khoa phòng và ca trực.
// Phòng 01–03 là phòng khám, 04 là phòng xét nghiệm. Mỗi phòng khám tối đa MỘT bác sĩ đang hoạt động;
// bác sĩ được gắn phòng ở Quản trị › Tài khoản nhân viên (users.room_id), đăng nhập là khám ở phòng đó.
// Không xóa phòng, chỉ ngừng dùng (is_active = false). Không đổi mã và loại phòng.
// Backend thật: GET /rooms (?include_inactive=true), POST /admin/rooms, PATCH /admin/rooms/{id}.
// Bản demo: danh sách phòng trong localStorage, bác sĩ của phòng suy ra từ tài khoản (accountStore, roomId).
import { apiGet, apiPost, apiRequest, ApiError, DEMO_MODE } from './client'

const KEY = 'medassist_rooms_v1'
export const ROOM_TYPES = { Exam: 'Consultation room', Lab: 'Lab room' }

const SEED = [
  { id: 'room-01', code: '01', name: 'Phòng khám 01', type: 'Exam' },
  { id: 'room-02', code: '02', name: 'Phòng khám 02', type: 'Exam' },
  { id: 'room-03', code: '03', name: 'Phòng khám 03', type: 'Exam' },
  { id: 'room-04', code: '04', name: 'Phòng xét nghiệm', type: 'Lab' }
].map((r) => ({ ...r, active: true, updatedAt: null }))

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
let rooms = read() ?? SEED
function save(next) {
  rooms = next
  try {
    localStorage.setItem(KEY, JSON.stringify(rooms))
  } catch {
    /* chỉ giữ trong phiên */
  }
}

// Bản demo: tra phòng theo id ngay (accountStore gắn mã, tên phòng vào tài khoản).
export const roomById = (id) => rooms.find((r) => r.id === id) ?? null

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

// Danh sách phòng kèm bác sĩ đang hoạt động của mỗi phòng. accounts: chỉ cần ở bản demo (tránh import vòng với accountStore).
export async function listRooms({ includeInactive = false, accounts = [] } = {}) {
  if (!DEMO_MODE) return (await apiGet(`/api/v1/rooms${includeInactive ? '?include_inactive=true' : ''}`)).map(fromServer)
  return rooms
    .filter((r) => includeInactive || r.active)
    .map((r) => {
      const doc = accounts.find((a) => a.roleKey === 'doctor' && a.active && a.roomId === r.id)
      return { ...r, physician: doc ? { id: doc.id, name: doc.fullName } : null }
    })
}
export const examRooms = (list) => list.filter((r) => r.type === 'Exam' && r.active)

export async function createRoom({ code, name, type = 'Exam' }) {
  const c = code.trim()
  const n = name.trim()
  if (!c || !n) return { ok: false, error: 'Enter the room code and name.' }
  if (!DEMO_MODE) {
    try {
      return { ok: true, room: fromServer(await apiPost('/api/v1/admin/rooms', { code: c, name: n, room_type: type })) }
    } catch (e) {
      return { ok: false, error: apiError(e) }
    }
  }
  if (rooms.some((r) => r.code.toLowerCase() === c.toLowerCase())) return { ok: false, error: ERRORS.ROOM_CODE_TAKEN }
  const room = { id: 'room-' + Date.now(), code: c, name: n, type, active: true, updatedAt: new Date().toISOString() }
  save([...rooms, room])
  return { ok: true, room }
}

// Đổi tên / ngừng dùng / dùng lại. Bản demo: inUse = phòng đang có bác sĩ (server tự kiểm tra ROOM_IN_USE).
export async function updateRoom(id, { name, active }, { inUse = false } = {}) {
  const body = {}
  if (name !== undefined) body.name = name.trim()
  if (active !== undefined) body.is_active = active
  if (body.name === '') return { ok: false, error: 'Enter the room code and name.' }
  if (!DEMO_MODE) {
    try {
      return { ok: true, room: fromServer(await apiRequest(`/api/v1/admin/rooms/${id}`, 'PATCH', body)) }
    } catch (e) {
      return { ok: false, error: apiError(e) }
    }
  }
  if (active === false && inUse) return { ok: false, error: ERRORS.ROOM_IN_USE }
  save(rooms.map((r) => (r.id === id ? { ...r, ...(body.name ? { name: body.name } : {}), ...(active !== undefined ? { active } : {}), updatedAt: new Date().toISOString() } : r)))
  return { ok: true, room: roomById(id) }
}
