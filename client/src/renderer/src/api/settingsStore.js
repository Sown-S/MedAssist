// Cài đặt hệ thống. Vài tham số nghiệp vụ nằm trên server (xem SERVER_SETTINGS); thông tin phòng khám và thời gian tự
// đăng xuất dùng chung mọi máy (xem loadClientConfig); còn lại là cài đặt của máy này.
import { useSyncExternalStore } from 'react'
import { apiGet, apiRequest, ApiError } from './client'

const KEY = 'medassist_settings_v1'
const CONFIG_KEY = 'medassist_client_config_v1'

export const PAPERS = [
  { key: 'A4', label: 'A4 (210 × 297 mm)', css: 'A4' },
  { key: 'A5', label: 'A5 (148 × 210 mm)', css: 'A5' },
  { key: '80mm', label: 'Thermal receipt 80 mm', css: '80mm auto' },
  { key: '58mm', label: 'Thermal receipt 58 mm', css: '58mm auto' }
]
export const PRINT_DOCS = [
  { key: 'prescription', label: 'Prescription' },
  { key: 'labOrder', label: 'Lab test order' },
  { key: 'invoice', label: 'Invoice / payment receipt' },
  { key: 'other', label: 'Other documents & reports' }
]
export const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'transfer', label: 'Bank transfer' }
]

export const DEFAULT_SETTINGS = {
  clinic: {
    name: '',
    address: '',
    phone: '',
    email: '',
    taxCode: '',
    licenseNo: '',
    licenseDate: '',
    licenseIssuer: '',
    director: '',
    directorLicense: '',
    logo: ''
  },
  // Dùng chung mọi máy (nằm trong clinic.profile); khổ giấy là cài đặt riêng máy (deviceSettings).
  // Chân trang rỗng thì phiếu không in chân trang — không tự điền câu mặc định để các máy không lệch nhau.
  print: { showLogo: true, header: '', footer: '' },
  // Chính sách mật khẩu và khoá đăng nhập do server quy định (GET /auth/password-policy); idleMinutes dùng chung mọi máy.
  security: { idleMinutes: 15 },
  ops: {
    nearDays: 90,
    // Chỉ cấp lô còn hạn > hôm nay + max(số ngày dùng, khoảng này).
    shelfBufferDays: 0,
    defaultThreshold: 50,
    consultFee: 80000,
    methods: ['cash', 'transfer']
  }
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}
function write(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {/* không lưu được thì chỉ giữ trong phiên */}
}
// Gộp sâu với mặc định để cài đặt mới thêm ở bản sau không làm hỏng dữ liệu đã lưu.
function merge(def, saved) {
  if (!saved || typeof def !== 'object' || Array.isArray(def)) return saved ?? def
  const out = {}
  for (const k of Object.keys(def)) out[k] = k in saved ? merge(def[k], saved[k]) : def[k]
  return out
}

// Tên trường clinic.profile trên server (snake_case) ↔ tên trong cài đặt của client.
const CLINIC_FIELDS = {
  name: 'name',
  address: 'address',
  phone: 'phone',
  email: 'email',
  taxCode: 'tax_code',
  licenseNo: 'license_no',
  licenseDate: 'license_date',
  licenseIssuer: 'license_issuer',
  director: 'director',
  directorLicense: 'director_license',
  logo: 'logo'
}
const clinicFromServer = (c) => Object.fromEntries(Object.entries(CLINIC_FIELDS).map(([k, sk]) => [k, c?.[sk] ?? '']))
const printFromServer = (c) => ({ showLogo: c?.show_logo ?? true, header: c?.print_header ?? '', footer: c?.print_footer ?? '' })
const profileToServer = (v) => ({
  ...Object.fromEntries(Object.entries(CLINIC_FIELDS).map(([k, sk]) => [sk, v.clinic[k] ?? ''])),
  print_header: v.print.header ?? '',
  print_footer: v.print.footer ?? '',
  show_logo: !!v.print.showLogo
})

// Bản client-config lấy được gần nhất: in phiếu và tự đăng xuất vẫn chạy khi mất kết nối. Chưa có bản nào (máy mới,
// chưa từng kết nối) thì thông tin phòng khám để trống, tự đăng xuất 15 phút.
const sharedOf = (values) => ({ clinic: values.clinic, print: values.print, idleMinutes: values.security.idleMinutes })
function withShared(values, cfg) {
  return {
    ...values,
    clinic: { ...DEFAULT_SETTINGS.clinic, ...cfg?.clinic },
    print: { ...DEFAULT_SETTINGS.print, ...cfg?.print },
    security: { ...values.security, idleMinutes: cfg?.idleMinutes ?? 15 }
  }
}
// Máy chỉ lưu phần riêng của nó; phần dùng chung nằm ở CONFIG_KEY.
function writeLocal() {
  const { clinic, print, security, ...own } = state.values
  write(KEY, { values: own })
}

const stored = read(KEY)
let state = { values: withShared(merge(DEFAULT_SETTINGS, stored?.values), read(CONFIG_KEY)) }
const listeners = new Set()
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getSettingsState = () => state
export const getSettings = () => state.values
export function useSettings() {
  return useSyncExternalStore(subscribe, getSettingsState)
}

export function flatten(obj, prefix = '') {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? prefix + '.' + k : k
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, p))
    else out[p] = v
  }
  return out
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
export function changedPaths(draft) {
  const a = flatten(state.values)
  const b = flatten(draft)
  return Object.keys(b).filter((k) => !same(a[k], b[k]))
}

// Tham số nghiệp vụ trên server (GET / PUT /admin/settings, chỉ Admin): ngưỡng sắp hết hạn, khoảng an toàn hạn dùng,
// thông tin phòng khám in trên phiếu, phí khám mặc định, thời gian tự đăng xuất.
const SERVER_SETTINGS = [
  { key: 'inventory.near_expiry_days', paths: ['ops.nearDays'], get: (v) => Math.round(Number(v.ops.nearDays)), set: (v, x) => ({ ...v, ops: { ...v.ops, nearDays: x } }) },
  { key: 'inventory.min_remaining_shelf_days', paths: ['ops.shelfBufferDays'], get: (v) => Math.round(Number(v.ops.shelfBufferDays)), set: (v, x) => ({ ...v, ops: { ...v.ops, shelfBufferDays: x } }) },
  { key: 'billing.default_consultation_fee', paths: ['ops.consultFee'], get: (v) => Math.round(Number(v.ops.consultFee)), set: (v, x) => ({ ...v, ops: { ...v.ops, consultFee: x } }) },
  {
    key: 'clinic.profile',
    paths: [...Object.keys(CLINIC_FIELDS).map((k) => 'clinic.' + k), 'print.showLogo', 'print.header', 'print.footer'],
    get: profileToServer,
    set: (v, x) => ({ ...v, clinic: clinicFromServer(x), print: printFromServer(x) })
  },
  {
    key: 'security.idle_logout_minutes',
    paths: ['security.idleMinutes'],
    get: (v) => Math.round(Number(v.security.idleMinutes)),
    set: (v, x) => ({ ...v, security: { ...v.security, idleMinutes: x } })
  }
]
export const isServerSetting = (path) => SERVER_SETTINGS.some((s) => s.paths.includes(path))

// GET /auth/client-config (không cần đăng nhập): gọi lúc mở app, sau khi đăng nhập và ngay sau khi Admin lưu.
// Mất kết nối → giữ bản đệm, trả false.
export async function loadClientConfig() {
  let r
  try {
    r = await apiGet('/api/v1/auth/client-config')
  } catch {
    return false
  }
  const cfg = { clinic: clinicFromServer(r.clinic), print: printFromServer(r.clinic), idleMinutes: r.idle_logout_minutes ?? 15 }
  write(CONFIG_KEY, cfg)
  state = { ...state, values: withShared(state.values, cfg) }
  listeners.forEach((fn) => fn())
  return true
}

export async function loadServerSettings() {
  const rows = await apiGet('/api/v1/admin/settings')
  let values = state.values
  for (const s of SERVER_SETTINGS) {
    const row = rows.find((r) => r.setting_key === s.key)
    if (row) values = s.set(values, row.value)
  }
  state = { ...state, values }
  writeLocal()
  write(CONFIG_KEY, sharedOf(values))
  listeners.forEach((fn) => fn())
}
// Lỗi → { ok: false, error }, không lưu gì ở máy.
export async function saveServerSettings(draft) {
  const changed = new Set(changedPaths(draft))
  try {
    for (const s of SERVER_SETTINGS) if (s.paths.some((p) => changed.has(p))) await apiRequest(`/api/v1/admin/settings/${s.key}`, 'PUT', { value: s.get(draft) })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? (e.details?.[0]?.message ?? e.message) : e.message }
  }
}

// Trả số trường đã đổi.
export function saveSettings(draft) {
  const paths = changedPaths(draft)
  if (!paths.length) return 0
  state = { values: draft }
  writeLocal()
  listeners.forEach((fn) => fn())
  return paths.length
}
