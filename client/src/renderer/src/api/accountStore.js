// Tài khoản nhân viên qua /auth và /admin/users — khoá tài khoản, phiên và mật khẩu đều do server kiểm.
import { getSettings } from './settingsStore'
import { apiGet, apiPost, apiRequest, ApiError } from './client'

// Server giữ hồ sơ nhân viên và khoá tạm (locked_until). Chưa có hết hạn mật khẩu hay đăng xuất cưỡng bức;
// tắt tài khoản = thu hồi mọi phiên.
const ROLE_OF = { Physician: 'doctor', Nurse: 'reception', Admin: 'admin' }
const SERVER_ROLE = { doctor: 'Physician', reception: 'Nurse', admin: 'Admin' }
const fromServer = (u) => ({
  id: u.user_id,
  staffCode: u.staff_code ?? '',
  username: u.username,
  fullName: u.full_name,
  roleKey: ROLE_OF[u.role],
  phone: u.phone ?? '',
  email: u.email ?? '',
  roomId: u.room_id ?? null,
  roomCode: u.room_code ?? '',
  roomName: u.room_name ?? '',
  licenseNo: u.license_no ?? '',
  active: u.is_active,
  mustChange: !!u.must_change_password,
  createdAt: u.created_at,
  createdBy: u.created_by ?? null,
  lastLoginAt: u.last_login_at ?? null,
  passwordChangedAt: null,
  failedAttempts: 0,
  locked: u.locked_until != null,
  lockedUntil: u.locked_until ?? null,
  sessionVersion: 0
})
// room_id chỉ dành cho bác sĩ; đổi sang vai trò khác thì gửi null.
const staffBody = (d, roleKey) => ({
  staff_code: (d.staffCode ?? '').trim() || null,
  license_no: roleKey === 'doctor' ? (d.licenseNo ?? '').trim() || null : null,
  room_id: roleKey === 'doctor' ? d.roomId || null : null
})
const ROOM_ERRORS = {
  INVALID_ROOM: 'This room cannot be assigned — it is a lab room, no longer in use or does not exist.',
  ROOM_PHYSICIAN_ONLY: 'Only doctors can have a consultation room.',
  STAFF_CODE_TAKEN: 'This staff code is already used.'
}
const roomTaken = (by) => (by ? `This room already belongs to ${by}. Each consultation room has one doctor.` : 'This room already belongs to another doctor. Each consultation room has one doctor.')
const apiError = (e) => {
  if (!(e instanceof ApiError)) return 'Cannot reach the clinic server. Check the server address and the network connection.'
  if (e.code === 'ROOM_TAKEN') return roomTaken(e.details?.[0]?.by)
  return ROOM_ERRORS[e.code] ?? e.details?.[0]?.message ?? e.message
}
const live = async (fn) => {
  try {
    return await fn()
  } catch (e) {
    return { ok: false, error: apiError(e) }
  }
}
async function listLive() {
  const out = []
  for (let offset = 0; ; offset += 200) {
    const page = await apiGet(`/api/v1/admin/users?limit=200&offset=${offset}`)
    out.push(...page.items)
    if (out.length >= page.total || !page.items.length) return out.map(fromServer)
  }
}
const patchLive = (id, body) => apiRequest(`/api/v1/admin/users/${id}`, 'PATCH', body)

// Chính sách mật khẩu do server quy định (GET /auth/password-policy); Cài đặt › Bảo mật chỉ hiển thị. Lỗi mạng → null.
export async function fetchPasswordPolicy() {
  try {
    const p = await apiGet('/api/v1/auth/password-policy')
    return { minLength: p.min_length, requireMix: p.require_letters_and_digits, maxFailed: p.max_failed_attempts, failedWindow: p.failed_window_minutes, lockMinutes: p.lock_minutes }
  } catch {
    return null
  }
}

export const ROLES = {
  doctor: { label: 'Doctor', home: '/doctor' },
  reception: { label: 'Receptionist', home: '/reception' },
  admin: { label: 'Administrator', home: '/reports' }
}

// Sai mật khẩu maxFailed lần thì server khoá tạm, không khoá vĩnh viễn (5 lần / 5 phút).
export const maxFailed = () => 5

// Tên mặc định của tài khoản Admin tạo lúc cài đặt (scripts.create_user) — nhắc đổi sang tên người thật.
export const hasDefaultName = (a) => a.fullName === 'System Administrator'

// Mật khẩu tạm do hệ thống sinh; admin chỉ xem một lần sau khi tạo / đặt lại.
export function genPassword() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const r = crypto.getRandomValues(new Uint32Array(Math.max(10, getSettings().security.minLength)))
  return Array.from(r, (n) => c[n % c.length]).join('') + '#1'
}

export const listAccounts = () => listLive()

// Xác nhận lại mật khẩu trước thao tác nhạy cảm: đăng nhập thử bằng chính tài khoản đang dùng.
export async function verifyPassword(id, password, username) {
  try {
    await apiPost('/api/v1/auth/login', { username, password })
    return true
  } catch {
    return false
  }
}

const NAME_IS_USERNAME = 'The full name is the same as the username. Enter the staff member’s real full name — it appears on the top bar and on printed documents.'
const sameAsUsername = (fullName, username) => fullName.trim().toLowerCase() === username.trim().toLowerCase()

export async function createAccount({ username, fullName, roleKey, phone = '', staffCode = '', roomId = null, licenseNo = '' }) {
  const u = username.trim()
  if (!u || !fullName.trim()) return { ok: false, error: 'Please enter a full name and username.' }
  if (sameAsUsername(fullName, u)) return { ok: false, error: NAME_IS_USERNAME }
  if (!ROLES[roleKey]) return { ok: false, error: 'Invalid role.' }
  // Mật khẩu tạm sinh ở máy này, gửi một lần qua HTTPS; server băm Argon2id.
  const password = genPassword()
  return live(async () => {
    const r = await apiPost('/api/v1/admin/users', {
      username: u.toLowerCase(),
      full_name: fullName.trim(),
      role: SERVER_ROLE[roleKey],
      password,
      phone: phone.trim() || null,
      ...staffBody({ staffCode, roomId, licenseNo }, roleKey)
    })
    return { ok: true, account: fromServer(r), password }
  })
}

export async function updateAccount(id, data) {
  // Server tự chặn hạ quyền / tắt Admin cuối cùng; đổi vai trò làm token cũ mất hiệu lực.
  return live(async () => {
    const before = (await listLive()).find((x) => x.id === id)
    const fullName = (data.fullName ?? before?.fullName ?? '').trim()
    if (before && sameAsUsername(fullName, before.username)) return { ok: false, error: NAME_IS_USERNAME }
    const roleKey = data.roleKey ?? before?.roleKey
    const r = await patchLive(id, { full_name: fullName, role: SERVER_ROLE[roleKey], phone: (data.phone ?? '').trim() || null, ...staffBody({ ...before, ...data }, roleKey) })
    return { ok: true, account: fromServer(r), before }
  })
}

export const setActive = (id, active) => live(async () => (await patchLive(id, { is_active: active }), { ok: true }))
export const unlockAccount = (id) => live(async () => ({ ok: true, account: fromServer(await apiPost(`/api/v1/admin/users/${id}/unlock`)) }))

// Sinh mật khẩu tạm mới, buộc đổi ở lần đăng nhập tới; server mở khoá và thu hồi mọi token cũ.
export function resetPassword(id) {
  const password = genPassword()
  return live(async () => (await apiPost(`/api/v1/admin/users/${id}/reset-password`, { new_password: password }), { ok: true, password }))
}
