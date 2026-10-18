// ĐÂY LÀ LỚP GIẢ LẬP (demo) cho bảng `users` của backend FastAPI + PostgreSQL.
// Khi có backend thật: thay toàn bộ file này bằng các lời gọi POST /auth/login, GET/POST/PATCH /admin/users.
// Mật khẩu ở backend thật phải băm bằng bcrypt/argon2 phía server; SHA-256 ở đây chỉ để KHÔNG lưu
// mật khẩu dạng chữ thường trong localStorage của bản demo — nó không đủ an toàn cho sản xuất.
// Khoá tài khoản, đăng xuất cưỡng bức (sessionVersion) và xác thực lại mật khẩu admin cũng PHẢI do server ép;
// ở đây chỉ mô phỏng đúng luồng để giao diện được viết đúng.
import { logEvent } from './activityStore'
import { getSettings } from './settingsStore'

const KEY = 'medassist_accounts_v1'

export const ROLES = {
  doctor: { label: 'Doctor', home: '/doctor' },
  reception: { label: 'Receptionist', home: '/reception' },
  admin: { label: 'Administrator', home: '/reports' }
}

// Chính sách mật khẩu & khoá tài khoản: Cài đặt › Bảo mật.
// Sai mật khẩu liên tiếp maxFailed lần thì khoá TẠM lockMinutes phút (hết hạn tự mở), Quản trị viên mở sớm được.
// Không khoá vĩnh viễn: nếu không, người lạ gõ sai 5 lần là khoá được Quản trị viên duy nhất → không ai mở khoá được.
// Theo backend (Quy định v5 §7): sai 5 lần / 15 phút thì khoá 5 phút — cố định ở server, không chỉnh từ giao diện.
export const maxFailed = () => 5
export const lockMinutes = () => 5
// Đang bị khoá thật sự? Bản ghi cũ chỉ có locked = true (không có hạn) coi như đã hết hạn.
const lockActive = (a) => !!a.locked && !!a.lockedUntil && Date.parse(a.lockedUntil) > Date.now()
const minutesLeft = (a) => Math.max(1, Math.ceil((Date.parse(a.lockedUntil) - Date.now()) / 60000))

// Tài khoản admin đầu tiên được tạo sẵn lúc cài đặt. Mật khẩu mặc định chỉ dùng cho lần đăng nhập đầu
// và BẮT BUỘC đổi ngay (mustChange = true). Bản triển khai thật nên sinh mật khẩu ngẫu nhiên lúc cài.
export const SEED_ADMIN = { username: 'admin', password: 'Admin@123', fullName: 'System Administrator' }
// Tên mặc định của các bản trước — tài khoản đã lưu còn mang tên này sẽ được đổi sang tên mới khi nạp.
const LEGACY_ADMIN_NAMES = ['Quản trị viên hệ thống', 'Receptionist Dashboard']
// Tài khoản admin còn mang tên mặc định (chưa đổi sang tên người thật).
export const hasDefaultName = (a) => a.fullName === SEED_ADMIN.fullName

async function hash(pw, salt) {
  const buf = new TextEncoder().encode(salt + ':' + pw)
  const d = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('')
}
function newSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Mật khẩu tạm do hệ thống sinh — admin không tự gõ, chỉ xem 1 lần sau khi tạo / đặt lại.
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
  } catch {
    /* localStorage không khả dụng: bản demo sẽ quay về tài khoản mặc định */
  }
}

const codeOf = (id) => 'NV' + String(id).padStart(3, '0')
// Bổ sung trường mới cho tài khoản lưu từ các bản trước.
const migrate = (x) => ({
  staffCode: codeOf(x.id),
  phone: '',
  departmentCode: '',
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
  const { salt, hash: h, ...rest } = a
  return { ...rest, locked: lockActive(a) }
}

export async function listAccounts() {
  return (await load()).map(publicView)
}

export async function verifyLogin(username, password, roleKey) {
  const list = await load()
  let a = list.find((x) => x.username.toLowerCase() === username.trim().toLowerCase())
  if (!a) return { ok: false, error: 'Incorrect username or password.' }
  if (lockActive(a)) return { ok: false, error: `This account is locked after too many failed sign-ins. Try again in ${minutesLeft(a)} minutes or ask an administrator to unlock it.` }
  // Hết hạn khoá → đếm lại từ đầu.
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
  // Đổi mật khẩu định kỳ: quá hạn thì bắt đặt mật khẩu mới ngay ở màn đăng nhập (như lần đăng nhập đầu).
  const { expiryDays } = getSettings().security
  const expired = !a.mustChange && expiryDays > 0 && (!a.passwordChangedAt || Date.now() - new Date(a.passwordChangedAt) > expiryDays * 86400000)
  return { ok: true, account: { ...publicView(a), mustChange: a.mustChange || expired }, expired }
}

// Ghi "đăng nhập gần nhất" khi phiên bắt đầu thật (sau bước đổi mật khẩu lần đầu nếu có).
export async function recordLogin(id) {
  await load()
  patch(id, { lastLoginAt: new Date().toISOString() })
}

// Phiên còn hợp lệ không: đọc thẳng localStorage để thấy thay đổi từ cửa sổ / máy khác (bản thật: server từ chối token).
export function sessionStillValid(id, sessionVersion) {
  const a = (read() ?? []).map(migrate).find((x) => x.id === id)
  if (!a) return true // localStorage không đọc được — không đá người dùng ra vì lỗi lưu trữ
  return a.active && !lockActive(a) && a.sessionVersion === sessionVersion
}

// Xác thực lại mật khẩu của chính người đang thao tác (admin) trước thao tác nhạy cảm.
export async function verifyPassword(id, password) {
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

// Họ tên hiện trên thanh trên cùng, hoá đơn, phiếu thu chi — không được để trùng tên đăng nhập (VD "letan").
const NAME_IS_USERNAME = 'The full name is the same as the username. Enter the staff member’s real full name — it appears on the top bar and on printed documents.'
const sameAsUsername = (fullName, username) => fullName.trim().toLowerCase() === username.trim().toLowerCase()

export async function createAccount({ username, fullName, roleKey, phone = '', departmentCode = '', licenseNo = '' }, by) {
  const list = await load()
  const u = username.trim()
  if (!u || !fullName.trim()) return { ok: false, error: 'Please enter a full name and username.' }
  if (sameAsUsername(fullName, u)) return { ok: false, error: NAME_IS_USERNAME }
  if (!ROLES[roleKey]) return { ok: false, error: 'Invalid role.' }
  if (list.some((x) => x.username.toLowerCase() === u.toLowerCase()))
    return { ok: false, error: 'This username already exists.' }
  const password = genPassword()
  const salt = newSalt()
  const acc = migrate({
    id: Math.max(0, ...list.map((x) => x.id)) + 1,
    staffCode: nextStaffCode(list),
    username: u,
    fullName: fullName.trim(),
    roleKey,
    phone: phone.trim(),
    departmentCode: roleKey === 'doctor' ? departmentCode : '',
    licenseNo: roleKey === 'doctor' ? licenseNo.trim() : '',
    active: true,
    mustChange: true, // nhân viên mới phải tự đặt mật khẩu ở lần đăng nhập đầu
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

// Sửa thông tin: họ tên, mã NV, SĐT, vai trò, khoa phòng & số chứng chỉ hành nghề (bác sĩ).
export async function updateAccount(id, data) {
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
  const next = {
    ...a,
    fullName,
    staffCode,
    roleKey,
    phone: (data.phone ?? a.phone).trim(),
    departmentCode: roleKey === 'doctor' ? data.departmentCode ?? a.departmentCode : '',
    licenseNo: roleKey === 'doctor' ? (data.licenseNo ?? a.licenseNo).trim() : ''
  }
  // Đổi vai trò → phiên đang mở hết hiệu lực, người dùng phải đăng nhập lại với vai trò mới.
  if (roleKey !== a.roleKey) next.sessionVersion = a.sessionVersion + 1
  save(list.map((x) => (x.id === id ? next : x)))
  return { ok: true, account: publicView(next), before: publicView(a) }
}

export async function setActive(id, active) {
  const list = await load()
  const a = list.find((x) => x.id === id)
  if (!a) return { ok: false, error: 'Account not found.' }
  if (!active && a.roleKey === 'admin' && activeAdmins(list).length <= 1)
    return { ok: false, error: 'The last administrator cannot be disabled.' }
  patch(id, { active })
  return { ok: true }
}

export async function unlockAccount(id) {
  const list = await load()
  if (!list.some((x) => x.id === id)) return { ok: false, error: 'Account not found.' }
  patch(id, { locked: false, lockedUntil: null, failedAttempts: 0 })
  return { ok: true }
}

// Đăng xuất cưỡng bức: tăng sessionVersion → mọi phiên đang mở của tài khoản này hết hiệu lực.
export async function forceSignOut(id) {
  const list = await load()
  const a = list.find((x) => x.id === id)
  if (!a) return { ok: false, error: 'Account not found.' }
  patch(id, { sessionVersion: a.sessionVersion + 1 })
  return { ok: true }
}

// Đặt lại mật khẩu: sinh mật khẩu tạm mới, buộc đổi ở lần đăng nhập tới, mở khoá và đá các phiên đang mở.
export async function resetPassword(id) {
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
