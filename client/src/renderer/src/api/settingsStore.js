// Cài đặt hệ thống. Vài tham số nghiệp vụ nằm trên server (xem SERVER_SETTINGS), còn lại là cài đặt của máy này.
import { useSyncExternalStore } from 'react'
import { apiGet, apiRequest, ApiError } from './client'

const KEY = 'medassist_settings_v1'

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
// date: phần ngày trong số → quyết định chu kỳ làm mới số.
export const NUMBERED_DOCS = [
  { key: 'invoice', label: 'Invoice' }
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
  print: {
    papers: { prescription: 'A5', labOrder: 'A5', invoice: '80mm', other: 'A4' },
    showLogo: true,
    header: '',
    footer: 'Thank you and wish you good health!'
  },
  numbering: {
    invoice: { prefix: 'HD', date: 'yymmdd', digits: 4 },
    queueResetAt: '00:00',
    queueStart: 1
  },
  security: { minLength: 8, requireMix: true, expiryDays: 0, maxFailed: 5, lockMinutes: 15, idleMinutes: 15 },
  backup: { enabled: true, time: '02:00', keep: 14, path: 'D:\\MedAssist\\Backup', offsite: '' },
  ops: {
    nearDays: 90,
    // Chỉ cấp lô còn hạn > hôm nay + max(số ngày dùng, khoảng này).
    shelfBufferDays: 0,
    defaultThreshold: 50,
    consultFee: 80000,
    rounding: 1000,
    methods: ['cash', 'transfer'],
    // Loa ở quầy đọc kèm họ tên khi mời. Mặc định tắt, chỉ đọc số và phòng (quyền riêng tư).
    announceName: false
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

const stored = read(KEY)
let state = { values: merge(DEFAULT_SETTINGS, stored?.values), updatedAt: stored?.updatedAt ?? null, updatedBy: stored?.updatedBy ?? null }
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
// thông tin phòng khám in trên phiếu, phí khám mặc định.
const SERVER_SETTINGS = [
  { key: 'inventory.near_expiry_days', paths: ['ops.nearDays'], get: (v) => Math.round(Number(v.ops.nearDays)), set: (v, x) => ({ ...v, ops: { ...v.ops, nearDays: x } }) },
  { key: 'inventory.min_remaining_shelf_days', paths: ['ops.shelfBufferDays'], get: (v) => Math.round(Number(v.ops.shelfBufferDays)), set: (v, x) => ({ ...v, ops: { ...v.ops, shelfBufferDays: x } }) },
  { key: 'billing.default_consultation_fee', paths: ['ops.consultFee'], get: (v) => Math.round(Number(v.ops.consultFee)), set: (v, x) => ({ ...v, ops: { ...v.ops, consultFee: x } }) },
  {
    key: 'clinic.profile',
    paths: ['clinic.name', 'clinic.address', 'clinic.phone'],
    get: (v) => ({ name: v.clinic.name, address: v.clinic.address, phone: v.clinic.phone }),
    set: (v, x) => ({ ...v, clinic: { ...v.clinic, name: x.name ?? '', address: x.address ?? '', phone: x.phone ?? '' } })
  }
]
export async function loadServerSettings() {
  const rows = await apiGet('/api/v1/admin/settings')
  let values = state.values
  for (const s of SERVER_SETTINGS) {
    const row = rows.find((r) => r.setting_key === s.key)
    if (row) values = s.set(values, row.value)
  }
  state = { ...state, values }
  write(KEY, state)
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
export function saveSettings(draft, user) {
  const paths = changedPaths(draft)
  if (!paths.length) return 0
  state = { values: draft, updatedAt: new Date().toISOString(), updatedBy: user.name }
  write(KEY, state)
  listeners.forEach((fn) => fn())
  return paths.length
}

function datePart(kind, d) {
  const y = String(d.getFullYear()).slice(2)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return { yymmdd: y + m + day, yymm: y + m, yy: y, none: '' }[kind] ?? ''
}
export function formatNumber(rule, seq, d = new Date()) {
  const parts = [rule.prefix, datePart(rule.date, d), String(seq).padStart(rule.digits, '0')].filter(Boolean)
  return parts.join('-')
}
