import { DOB_RE } from '../../../components/PatientFields'

// Tự đăng xuất sau bao nhiêu phút không thao tác (0 = tắt).
export const IDLE = [
  { key: 0, label: 'Off' },
  { key: 5, label: '5 minutes' },
  { key: 10, label: '10 minutes' },
  { key: 15, label: '15 minutes' },
  { key: 30, label: '30 minutes' },
  { key: 60, label: '60 minutes' }
]

// Đọc / ghi giá trị theo đường dẫn “nhóm.khoá” trong bản nháp cài đặt.
export function getAt(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}
export function setAt(obj, path, value) {
  const [k, ...rest] = path.split('.')
  return { ...obj, [k]: rest.length ? setAt(obj[k], rest.join('.'), value) : value }
}

// Lỗi theo đường dẫn ô → câu hiển thị dưới ô đó.
export function validate(d) {
  const e = {}
  const int = (v) => Number.isInteger(Number(v)) && String(v).trim() !== ''
  if (!d.clinic.name.trim()) e['clinic.name'] = 'Enter the clinic name — it is printed on every document.'
  if (d.clinic.email && !/^\S+@\S+\.\S+$/.test(d.clinic.email)) e['clinic.email'] = 'Invalid email address.'
  if (d.clinic.licenseDate && !DOB_RE.test(d.clinic.licenseDate)) e['clinic.licenseDate'] = 'Enter a valid date (dd/mm/yyyy)'
  if (d.clinic.taxCode && !/^\d{10}(-\d{3})?$/.test(d.clinic.taxCode)) e['clinic.taxCode'] = 'A tax code has 10 digits (or 10 digits + "-" + 3 digits for a branch).'
  if (!int(d.ops.defaultThreshold) || d.ops.defaultThreshold < 0) e['ops.defaultThreshold'] = 'Enter a whole number.'
  if (!int(d.ops.shelfBufferDays ?? 0) || (d.ops.shelfBufferDays ?? 0) < 0 || (d.ops.shelfBufferDays ?? 0) > 365) e['ops.shelfBufferDays'] = 'Enter 0–365 days.'
  if (!int(d.ops.consultFee) || d.ops.consultFee < 0) e['ops.consultFee'] = 'Enter an amount in đồng.'
  if (!d.ops.methods.length) e['ops.methods'] = 'Enable at least one payment method.'
  const inRange = (v, lo, hi, whole) => String(v ?? '').trim() !== '' && (!whole || int(v)) && Number(v) >= lo && Number(v) <= hi
  if (!inRange(d.ops.clusterDays, 1, 30, true)) e['ops.clusterDays'] = 'Enter 1–30 days.'
  if (!inRange(d.ops.clusterMinCases, 2, 1000, true)) e['ops.clusterMinCases'] = 'Enter a whole number from 2 to 1000.'
  if (!inRange(d.ops.clusterRatio, 1, 10, false)) e['ops.clusterRatio'] = 'Enter a number from 1 to 10.'
  return e
}
