import { NUMBERED_DOCS } from '../../../api/settingsStore'

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
  if (d.clinic.taxCode && !/^\d{10}(-\d{3})?$/.test(d.clinic.taxCode)) e['clinic.taxCode'] = 'A tax code has 10 digits (or 10 digits + "-" + 3 digits for a branch).'
  for (const doc of NUMBERED_DOCS) {
    const r = d.numbering[doc.key]
    if (!/^[A-Z0-9]{0,6}$/.test(r.prefix)) e[`numbering.${doc.key}.prefix`] = 'Use up to 6 capital letters or digits.'
    if (!int(r.digits) || r.digits < 2 || r.digits > 6) e[`numbering.${doc.key}.digits`] = 'Between 2 and 6.'
  }
  const prefixes = NUMBERED_DOCS.map((x) => d.numbering[x.key].prefix).filter(Boolean)
  NUMBERED_DOCS.forEach((x) => {
    const p = d.numbering[x.key].prefix
    if (p && prefixes.filter((y) => y === p).length > 1) e[`numbering.${x.key}.prefix`] = 'Each document type needs its own prefix.'
  })
  if (!int(d.numbering.queueStart) || d.numbering.queueStart < 0) e['numbering.queueStart'] = 'Enter a whole number.'
  if (!int(d.security.minLength) || d.security.minLength < 8 || d.security.minLength > 64) e['security.minLength'] = 'Between 8 and 64 characters.'
  if (!int(d.security.maxFailed) || d.security.maxFailed < 3 || d.security.maxFailed > 20) e['security.maxFailed'] = 'Between 3 and 20 attempts.'
  if (!int(d.security.lockMinutes) || d.security.lockMinutes < 1 || d.security.lockMinutes > 1440) e['security.lockMinutes'] = 'Between 1 and 1440 minutes.'
  if (!int(d.backup.keep) || d.backup.keep < 1 || d.backup.keep > 365) e['backup.keep'] = 'Between 1 and 365.'
  if (d.backup.enabled && !d.backup.path.trim()) e['backup.path'] = 'Enter the folder where backups are stored.'
  if (!int(d.ops.defaultThreshold) || d.ops.defaultThreshold < 0) e['ops.defaultThreshold'] = 'Enter a whole number.'
  if (!int(d.ops.shelfBufferDays ?? 0) || (d.ops.shelfBufferDays ?? 0) < 0 || (d.ops.shelfBufferDays ?? 0) > 365) e['ops.shelfBufferDays'] = 'Enter 0–365 days.'
  if (!int(d.ops.consultFee) || d.ops.consultFee < 0) e['ops.consultFee'] = 'Enter an amount in đồng.'
  if (!d.ops.methods.length) e['ops.methods'] = 'Enable at least one payment method.'
  return e
}
