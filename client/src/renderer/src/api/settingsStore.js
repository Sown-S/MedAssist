// CÀI ĐẶT HỆ THỐNG — lớp giả lập cho bảng system_settings của backend.
// Mỗi lần lưu ghi nhật ký từng trường (giá trị cũ → mới). Bản thật: GET/PUT /admin/settings, server kiểm tra lại
// mọi giá trị và tự áp dụng phần do server đảm nhiệm (lịch sao lưu, giờ làm mới số thứ tự...).
import { useSyncExternalStore } from 'react'
import { logEvent } from './activityStore'

const KEY = 'medassist_settings_v1'
const COUNTERS_KEY = 'medassist_counters_v1'

export const PAPERS = [
  { key: 'A4', label: 'A4 (210 × 297 mm)', css: 'A4' },
  { key: 'A5', label: 'A5 (148 × 210 mm)', css: 'A5' },
  { key: '80mm', label: 'Thermal receipt 80 mm', css: '80mm auto' },
  { key: '58mm', label: 'Thermal receipt 58 mm', css: '58mm auto' }
]
// Giấy tờ in được — khổ giấy riêng cho từng loại.
export const PRINT_DOCS = [
  { key: 'prescription', label: 'Prescription' },
  { key: 'labOrder', label: 'Lab test order' },
  { key: 'invoice', label: 'Invoice / payment receipt' },
  { key: 'other', label: 'Other documents & reports' }
]
// Chứng từ được đánh số. date = phần ngày trong số → quyết định chu kỳ làm mới số.
export const NUMBERED_DOCS = [
  { key: 'invoice', label: 'Invoice' }
]
export const DATE_PARTS = [
  { key: 'yymmdd', label: 'Day (YYMMDD)', reset: 'Daily' },
  { key: 'yymm', label: 'Month (YYMM)', reset: 'Monthly' },
  { key: 'yy', label: 'Year (YY)', reset: 'Yearly' },
  { key: 'none', label: 'No date', reset: 'Never' }
]
export const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'transfer', label: 'Bank transfer' },
  { key: 'card', label: 'Bank card' },
  { key: 'ewallet', label: 'E-wallet' }
]
export const ROUNDING = [
  { key: 1, label: 'No rounding' },
  { key: 100, label: 'To 100đ' },
  { key: 500, label: 'To 500đ' },
  { key: 1000, label: 'To 1,000đ' }
]
export const WEEKDAYS = [
  { key: 1, label: 'Mon' },
  { key: 2, label: 'Tue' },
  { key: 3, label: 'Wed' },
  { key: 4, label: 'Thu' },
  { key: 5, label: 'Fri' },
  { key: 6, label: 'Sat' },
  { key: 0, label: 'Sun' }
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
    open: '07:30',
    close: '17:30',
    workDays: [1, 2, 3, 4, 5, 6],
    nearDays: 90,
    // Khoảng an toàn hạn dùng khi trừ kho lúc chốt đơn: chỉ cấp lô còn hạn > hôm nay + max(số ngày dùng, khoảng này).
    shelfBufferDays: 0,
    defaultThreshold: 50,
    consultFee: 80000,
    rounding: 1000,
    methods: ['cash', 'transfer'],
    // Nhà thuốc của phòng khám có bán thuốc gây nghiện / hướng thần (N/H) không. Mặc định KHÔNG: bác sĩ vẫn kê đơn N/H riêng,
    // bệnh nhân mua ở nhà thuốc đủ điều kiện bên ngoài; nhà thuốc phòng khám không thu tiền / xuất kho các thuốc này.
    sellControlled: false,
    // Loa ở quầy đọc kèm HỌ TÊN khi bác sĩ mời ("Mời số 9, Nguyễn Văn A, vào phòng P.101"). Mặc định tắt — chỉ đọc số + phòng (quyền riêng tư).
    announceName: false
  },
  retention: { auditYears: 10, recordYears: 10 }
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
  } catch {
    /* chỉ giữ trong phiên */
  }
}
// Gộp sâu với mặc định: thêm cài đặt mới ở bản sau không làm hỏng dữ liệu đã lưu.
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

// Danh sách phẳng "đường dẫn → giá trị" để so sánh bản nháp với bản đã lưu.
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

// labelOf(path) → nhãn tiếng Anh của trường (để nhật ký hiển thị theo ngôn ngữ), show(path, v) → chuỗi giá trị.
export function saveSettings(draft, user, labelOf, show) {
  const paths = changedPaths(draft)
  if (!paths.length) return 0
  const before = flatten(state.values)
  const after = flatten(draft)
  state = { values: draft, updatedAt: new Date().toISOString(), updatedBy: user.name }
  write(KEY, state)
  listeners.forEach((fn) => fn())
  for (const p of paths)
    logEvent(user, 'settings.update', {
      target: { kind: 'settings', id: p.split('.')[0] },
      params: { field: labelOf(p) },
      before: show(p, before[p]),
      after: show(p, after[p])
    })
  return paths.length
}

// ---------- Đánh số chứng từ ----------
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
// Số tiếp theo khi đã có đủ danh sách chứng từ (phiên kiểm kho, biên bản huỷ, phiếu thu chi): số nhỏ nhất chưa dùng
// trong kỳ hiện tại. Hàm thuần — gọi để hiện trước số trên form cũng không "tiêu" mất số nào.
// Bản thật: server cấp số trong cùng giao dịch lưu chứng từ (sequence của PostgreSQL), client không tự đánh số.
export function nextNumber(kind, existing = [], d = new Date()) {
  const rule = state.values.numbering[kind]
  const used = new Set(existing)
  let n = 0
  let code
  do code = formatNumber(rule, ++n, d)
  while (used.has(code))
  return code
}
// Chứng từ không có danh sách ở client (hoá đơn): giữ bộ đếm theo kỳ.
export function takeNumber(kind, d = new Date()) {
  const rule = state.values.numbering[kind]
  const counters = read(COUNTERS_KEY) ?? {}
  const period = kind + ':' + rule.prefix + ':' + datePart(rule.date, d)
  const n = (counters[period] ?? 0) + 1
  write(COUNTERS_KEY, { ...counters, [period]: n })
  return formatNumber(rule, n, d)
}

// Làm tròn số tiền thu theo cài đặt (làm tròn đến bội gần nhất).
export function roundMoney(n) {
  const step = state.values.ops.rounding || 1
  return Math.round(n / step) * step
}
