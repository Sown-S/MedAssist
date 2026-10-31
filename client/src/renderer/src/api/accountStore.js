// Tài khoản nhân viên. Bản demo lưu trong localStorage (SHA-256 chỉ để không lưu mật khẩu dạng chữ);
// chạy thật gọi /auth và /admin/users — khoá tài khoản, phiên và mật khẩu đều do server kiểm.
import { logEvent } from './activityStore'
import { getSettings } from './settingsStore'
import { apiGet, apiPost, apiRequest, ApiError, DEMO_MODE } from './client'
import { roomById } from './roomStore'

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

const KEY = 'medassist_accounts_v1'

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

// Sai mật khẩu maxFailed lần thì khoá tạm lockMinutes phút, không khoá vĩnh viễn — tránh người lạ khoá được
// Quản trị viên duy nhất. Giá trị khớp với server (5 lần / 5 phút).
export const maxFailed = () => 5
export const lockMinutes = () => 5
// Bản ghi cũ chỉ có locked = true (không có hạn) coi như đã hết hạn.
const lockActive = (a) => !!a.locked && !!a.lockedUntil && Date.parse(a.lockedUntil) > Date.now()
const minutesLeft = (a) => Math.max(1, Math.ceil((Date.parse(a.lockedUntil) - Date.now()) / 60000))

// Admin mặc định của bản demo, bắt đổi mật khẩu ở lần đăng nhập đầu.
export const SEED_ADMIN = { username: 'admin', password: 'Admin@123', fullName: 'System Administrator' }
// Tên mặc định của các bản trước — đổi sang tên mới khi nạp.
const LEGACY_ADMIN_NAMES = ['Quản trị viên hệ thống', 'Receptionist Dashboard']
export const hasDefaultName = (a) => a.fullName === SEED_ADMIN.fullName

async function hash(pw, salt) {
  const buf = new TextEncoder().encode(salt + ':' + pw)
  const d = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('')
}
function newSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Mật khẩu tạm do hệ thống sinh; admin chỉ xem một lần sau khi tạo / đặt lại.
export function genPassword() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const r = crypto.getRandomValues(new Uint32Array(Math.max(10, getSettings().security.minLength)))
  return Array.from(r, (n) => c[n % c.length]).join('') + '#1'
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {/* localStorage không dùng được → quay về tài khoản mặc định */}
}

const codeOf = (id) => 'NV' + String(id).padStart(3, '0')
const migrate = (x) => ({
  staffCode: codeOf(x.id),
  phone: '',
  roomId: null,
  licenseNo: '',
  createdAt: null,
  createdBy: null,
  lastLoginAt: null,
  passwordChangedAt: null,
  failedAttempts: 0,
  locked: false,
  lockedUntil: null,
  sessionVersion: 0,
  ...x,
  fullName: LEGACY_ADMIN_NAMES.includes(x.fullName) ? SEED_ADMIN.fullName : x.fullName
})

let memory = null
async function load() {
  if (memory) return memory
  let list = read()
  if (!list || !list.length) {
    const salt = newSalt()
    list = [
      {
        id: 1,
        username: SEED_ADMIN.username,
        fullName: SEED_ADMIN.fullName,
        roleKey: 'admin',
        active: true,
        mustChange: true,
        createdAt: new Date().toISOString(),
        createdBy: 'System',
        salt,
        hash: await hash(SEED_ADMIN.password, salt)
      }
    ]
  }
  memory = list.map(migrate)
  write(memory)
  return memory
}
function save(list) {
  memory = list
  write(list)
}
function patch(id, fields) {
  save(memory.map((x) => (x.id === id ? { ...x, ...fields } : x)))
}

export function publicView(a) {
  const { salt, hash: h, departmentCode, ...rest } = a
  const room = a.roomId ? roomById(a.roomId) : null
  return { ...rest, roomCode: room?.code ?? '', roomName: room?.name ?? '', locked: lockActive(a) }
}
// Mô phỏng lỗi 422 INVALID_ROOM / 409 ROOM_TAKEN của server.
function roomConflict(list, id, roomId, roleKey, active = true) {
  if (roleKey !== 'doctor' || !roomId || !active) return null
  const room = roomById(roomId)
  if (!room || room.type !== 'Exam' || !room.active) return ROOM_ERRORS.INVALID_ROOM
  const other = list.find((x) => x.id !== id && x.roleKey === 'doctor' && x.active && x.roomId === roomId)
  return other ? roomTaken(other.fullName) : null
}

export async function listAccounts() {
  if (!DEMO_MODE) return listLive()
  return (await load()).map(publicView)
}

export async function verifyLogin(username, password, roleKey) {
  const list = await load()
  let a = list.find((x) => x.username.toLowerCase() === username.trim().toLowerCase())
  if (!a) return { ok: false, error: 'Incorrect username or password.' }
  if (lockActive(a)) return { ok: false, error: `This account is locked after too many failed sign-ins. Try again in ${minutesLeft(a)} minutes or ask an administrator to unlock it.` }
  if (a.locked) {
    patch(a.id, { locked: false, lockedUntil: null, failedAttempts: 0 })
    a = { ...a, locked: false, lockedUntil: null, failedAttempts: 0 }
  }
  if ((await hash(password, a.salt)) !== a.hash) {
    const failedAttempts = (a.failedAttempts ?? 0) + 1
    const locked = failedAttempts >= maxFailed()
    const lockedUntil = locked ? new Date(Date.now() + lockMinutes() * 60000).toISOString() : null
    patch(a.id, { failedAttempts, locked, lockedUntil })
    if (locked) {
      logEvent(null, 'account.locked', { target: { kind: 'account', id: a.username }, params: { account: a.username, n: failedAttempts, minutes: lockMinutes() } })
      return { ok: false, error: `This account is locked after too many failed sign-ins. Try again in ${lockMinutes()} minutes or ask an administrator to unlock it.` }
    }
    return { ok: false, error: 'Incorrect username or password.' }
  }
  if (!a.active) return { ok: false, error: 'This account has been disabled. Contact your administrator.' }
  if (a.roleKey !== roleKey) return { ok: false, error: 'This account does not belong to the selected role.' }
  if (a.failedAttempts) patch(a.id, { failedAttempts: 0 })
  // Quá hạn đổi mật khẩu định kỳ → bắt đặt mật khẩu mới ngay ở màn đăng nhập.
  const { expiryDays } = getSettings().security
  const expired = !a.mustChange && expiryDays > 0 && (!a.passwordChangedAt || Date.now() - new Date(a.passwordChangedAt) > expiryDays * 86400000)
  return { ok: true, account: { ...publicView(a), mustChange: a.mustChange || expired }, expired }
}

// Ghi lần đăng nhập gần nhất khi phiên thật sự bắt đầu (sau bước đổi mật khẩu lần đầu nếu có).
export async function recordLogin(id) {
  await load()
  patch(id, { lastLoginAt: new Date().toISOString() })
}

// Đọc thẳng localStorage để thấy thay đổi từ cửa sổ khác (chạy thật: server từ chối token).
export function sessionStillValid(id, sessionVersion) {
  const a = (read() ?? []).map(migrate).find((x) => x.id === id)
  if (!a) return true // lỗi lưu trữ không được đá người dùng ra
  return a.active && !lockActive(a) && a.sessionVersion === sessionVersion
}

// Admin nhập lại mật khẩu trước thao tác nhạy cảm. Chạy thật: thử đăng nhập bằng chính tài khoản đó để server
// đếm sai và khoá như thường; token trả về bị bỏ, phiên đang dùng giữ nguyên.
export async function verifyPassword(id, password, username) {
  if (!DEMO_MODE) {
    try {
      await apiPost('/api/v1/auth/login', { username, password })
      return true
    } catch {
      return false
    }
  }
  const a = (await load()).find((x) => x.id === id)
  return !!a && (await hash(password, a.salt)) === a.hash
}

export function checkPassword(pw) {
  const { minLength, requireMix } = getSettings().security
  if (!pw || pw.length < minLength) return `Password must be at least ${minLength} characters.`
  if (requireMix && !(/[A-Za-z]/.test(pw) && /\d/.test(pw))) return 'Password must contain both letters and digits.'
  return null
}

function nextStaffCode(list) {
  const n = Math.max(0, ...list.map((x) => +String(x.staffCode).replace(/\D/g, '') || 0)) + 1
  return codeOf(n)
}

// Họ tên in trên giấy tờ nên không được trùng tên đăng nhập.
const NAME_IS_USERNAME = 'The full name is the same as the username. Enter the staff member’s real full name — it appears on the top bar and on printed documents.'
const sameAsUsername = (fullName, username) => fullName.trim().toLowerCase() === username.trim().toLowerCase()

export async function createAccount({ username, fullName, roleKey, phone = '', staffCode = '', roomId = null, licenseNo = '' }, by) {
  const u = username.trim()
  if (!u || !fullName.trim()) return { ok: false, error: 'Please enter a full name and username.' }
  if (sameAsUsername(fullName, u)) return { ok: false, error: NAME_IS_USERNAME }
  if (!ROLES[roleKey]) return { ok: false, error: 'Invalid role.' }
  // Mật khẩu tạm sinh ở máy này, gửi một lần qua HTTPS; server băm Argon2id.
  if (!DEMO_MODE) {
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
  const list = await load()
  if (list.some((x) => x.username.toLowerCase() === u.toLowerCase()))
    return { ok: false, error: 'This username already exists.' }
  const conflict = roomConflict(list, null, roomId, roleKey)
  if (conflict) return { ok: false, error: conflict }
  const password = genPassword()
  const salt = newSalt()
  const acc = migrate({
    id: Math.max(0, ...list.map((x) => x.id)) + 1,
    staffCode: nextStaffCode(list),
    username: u,
    fullName: fullName.trim(),
    roleKey,
    phone: phone.trim(),
    roomId: roleKey === 'doctor' ? roomId || null : null,
    licenseNo: roleKey === 'doctor' ? licenseNo.trim() : '',
    active: true,
    mustChange: true,
    createdAt: new Date().toISOString(),
    createdBy: by?.name ?? null,
    salt,
    hash: await hash(password, salt)
  })
  save([...list, acc])
  return { ok: true, account: publicView(acc), password }
}

function activeAdmins(list) {
  return list.filter((x) => x.roleKey === 'admin' && x.active)
}

export async function updateAccount(id, data) {
  // Server tự chặn hạ quyền / tắt Admin cuối cùng; đổi vai trò làm token cũ mất hiệu lực.
  if (!DEMO_MODE)
    return live(async () => {
      const before = (await listLive()).find((x) => x.id === id)
      const fullName = (data.fullName ?? before?.fullName ?? '').trim()
      if (before && sameAsUsername(fullName, before.username)) return { ok: false, error: NAME_IS_USERNAME }
      const roleKey = data.roleKey ?? before?.roleKey
      const r = await patchLive(id, { full_name: fullName, role: SERVER_ROLE[roleKey], phone: (data.phone ?? '').trim() || null, ...staffBody({ ...before, ...data }, roleKey) })
      return { ok: true, account: fromServer(r), before }
    })
  const list = await load()
  const a = list.find((x) => x.id === id)
  if (!a) return { ok: false, error: 'Account not found.' }
  const fullName = (data.fullName ?? a.fullName).trim()
  if (!fullName) return { ok: false, error: 'Please enter a full name and username.' }
  if (sameAsUsername(fullName, a.username)) return { ok: false, error: NAME_IS_USERNAME }
  const roleKey = data.roleKey ?? a.roleKey
  if (!ROLES[roleKey]) return { ok: false, error: 'Invalid role.' }
  if (a.roleKey === 'admin' && roleKey !== 'admin' && a.active && activeAdmins(list).length <= 1)
    return { ok: false, error: 'The last administrator cannot be moved to another role.' }
  const staffCode = (data.staffCode ?? a.staffCode).trim()
  if (staffCode && list.some((x) => x.id !== id && x.staffCode === staffCode)) return { ok: false, error: 'This staff code is already used.' }
  const roomId = roleKey === 'doctor' ? (data.roomId !== undefined ? data.roomId : a.roomId) || null : null
  const conflict = roomConflict(list, id, roomId, roleKey, a.active)
  if (conflict) return { ok: false, error: conflict }
  const next = {
    ...a,
    fullName,
    staffCode,
    roleKey,
    phone: (data.phone ?? a.phone).trim(),
    roomId,
    licenseNo: roleKey === 'doctor' ? (data.licenseNo ?? a.licenseNo).trim() : ''
  }
  // Đổi vai trò → phiên đang mở hết hiệu lực.
  if (roleKey !== a.roleKey) next.sessionVersion = a.sessionVersion + 1
  save(list.map((x) => (x.id === id ? next : x)))
  return { ok: true, account: publicView(next), before: publicView(a) }
}

export async function setActive(id, active) {
  if (!DEMO_MODE) return live(async () => (await patchLive(id, { is_active: active }), { ok: true }))
  const list = await load()
  const a = list.find((x) => x.id === id)
  if (!a) return { ok: false, error: 'Account not found.' }
  if (!active && a.roleKey === 'admin' && activeAdmins(list).length <= 1)
    return { ok: false, error: 'The last administrator cannot be disabled.' }
  // Phòng đã giao cho bác sĩ khác → như 409 ROOM_TAKEN.
  const conflict = active && roomConflict(list, id, a.roomId, a.roleKey)
  if (conflict) return { ok: false, error: conflict }
  patch(id, { active })
  return { ok: true }
}

// Server chưa có đăng xuất cưỡng bức: muốn thu hồi phiên thì tắt tài khoản.
const NOT_ON_SERVER = { ok: false, error: 'Not available with the clinic server — disable the account to end its sessions.' }
export async function unlockAccount(id) {
  if (!DEMO_MODE) return live(async () => ({ ok: true, account: fromServer(await apiPost(`/api/v1/admin/users/${id}/unlock`)) }))
  const list = await load()
  if (!list.some((x) => x.id === id)) return { ok: false, error: 'Account not found.' }
  patch(id, { locked: false, lockedUntil: null, failedAttempts: 0 })
  return { ok: true }
}

export async function forceSignOut(id) {
  if (!DEMO_MODE) return NOT_ON_SERVER
  const list = await load()
  const a = list.find((x) => x.id === id)
  if (!a) return { ok: false, error: 'Account not found.' }
  patch(id, { sessionVersion: a.sessionVersion + 1 })
  return { ok: true }
}

// Sinh mật khẩu tạm mới, buộc đổi ở lần đăng nhập tới, mở khoá và kết thúc các phiên đang mở.
export async function resetPassword(id) {
  // Server thu hồi mọi token cũ khi đổi mật khẩu.
  if (!DEMO_MODE) {
    const password = genPassword()
    return live(async () => (await apiPost(`/api/v1/admin/users/${id}/reset-password`, { new_password: password }), { ok: true, password }))
  }
  const list = await load()
  const a = list.find((x) => x.id === id)
  if (!a) return { ok: false, error: 'Account not found.' }
  const password = genPassword()
  const salt = newSalt()
  patch(id, { salt, hash: await hash(password, salt), mustChange: true, locked: false, lockedUntil: null, failedAttempts: 0, sessionVersion: a.sessionVersion + 1 })
  return { ok: true, password }
}

export async function changeOwnPassword(id, password, oldPassword) {
  const list = await load()
  const a = list.find((x) => x.id === id)
  if (!a) return { ok: false, error: 'Account not found.' }
  if ((await hash(oldPassword ?? '', a.salt)) !== a.hash) return { ok: false, error: 'The current password is incorrect.' }
  const pe = checkPassword(password)
  if (pe) return { ok: false, error: pe }
  if (password === oldPassword) return { ok: false, error: 'The new password must be different from the old one.' }
  const salt = newSalt()
  patch(id, { salt, hash: await hash(password, salt), mustChange: false, passwordChangedAt: new Date().toISOString() })
  return { ok: true }
}
