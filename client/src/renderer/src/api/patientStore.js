// Danh bạ bệnh nhân của bản demo. Tìm theo từ khoá (họ tên, SĐT, mã hồ sơ). Chạy thật: GET / POST /patients,
// server kiểm tra trùng lần nữa trước khi tạo.
import { useSyncExternalStore } from 'react'
import { logEvent } from './activityStore'

const KEY = 'medassist_patients_v1'

// [họ tên, SĐT, ngày sinh dd/mm/yyyy, giới, dị ứng, bệnh nền]
const SEED = [
  ['Phạm Thị Hoa', '0912456789', '12/03/1975', 'Female', '', ''],
  ['Lê Quốc Bảo', '0989456231', '20/05/1999', 'Male', '', ''],
  ['Đặng Thị Kim', '0905112233', '02/09/1981', 'Female', '', 'Hypothyroidism'],
  ['Võ Minh Tuấn', '0938765432', '15/01/1987', 'Male', '', 'Chronic gastritis'],
  ['Nguyễn Thị Lan', '0967622356', '08/06/1958', 'Female', 'Penicillin', 'Hypertension'],
  ['Bùi Văn Long', '0977001122', '30/11/1970', 'Male', '', 'Hypertension, type 2 diabetes'],
  ['Nguyễn Minh Anh', '0989095886', '05/08/2022', 'Female', '', ''],
  ['Trần Văn Hùng', '0912345678', '10/10/1992', 'Male', '', ''],
  ['Hoàng Thị Thu', '0915667788', '22/02/1954', 'Female', 'Sulfonamides', 'Hypertension'],
  ['Lý Gia Huy', '0356123456', '17/07/2004', 'Male', '', ''],
  ['Phan Thị Ngọc', '0868234567', '03/04/1995', 'Female', '', 'Asthma'],
  ['Đỗ Văn Khánh', '0903456789', '25/12/1979', 'Male', '', ''],
  ['Trịnh Văn Sơn', '0918889900', '14/02/1965', 'Male', '', 'Coronary artery disease'],
  ['Nguyễn Văn Thành', '0967622357', '12/07/1995', 'Male', '', ''],
  ['Lê Văn Nam', '0339698780', '08/08/1960', 'Male', 'Aspirin', 'Type 2 diabetes'],
  ['Hồ Thu Ngành', '0339798182', '01/01/1990', 'Female', '', '']
]

const codeOf = (n) => 'BN' + String(n).padStart(6, '0')
function seed() {
  return SEED.map(([name, phone, dob, gender, allergies, history], i) => ({ id: codeOf(101 + i), name, phone, dob, gender, allergies, history }))
}
function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
let patients = read() ?? seed()
const listeners = new Set()
function commit(next) {
  patients = next
  try {
    localStorage.setItem(KEY, JSON.stringify(patients))
  } catch {/* không lưu được thì chỉ giữ trong phiên */}
  listeners.forEach((fn) => fn())
}
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getPatients = () => patients
export function usePatients() {
  return useSyncExternalStore(subscribe, getPatients)
}
export const findPatient = (id) => patients.find((p) => p.id === id)

// Bỏ dấu + chữ thường: gõ “nguyen thi lan” vẫn ra “Nguyễn Thị Lan”.
export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
const digits = (s) => String(s ?? '').replace(/\D/g, '')

export function ageOf(dob) {
  const m = String(dob ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return ''
  // Ngày phải có thật trên lịch (31/02, tháng 13… là gõ nhầm).
  const real = new Date(+m[3], +m[2] - 1, +m[1])
  if (real.getFullYear() !== +m[3] || real.getMonth() !== +m[2] - 1 || real.getDate() !== +m[1]) return ''
  const now = new Date()
  let age = now.getFullYear() - +m[3]
  if (now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[1])) age--
  return age >= 0 && age < 130 ? age : ''
}

// Mọi từ phải khớp họ tên / mã hồ sơ; chuỗi toàn số thì khớp SĐT hoặc mã.
export function searchPatients(q, limit = 30) {
  const k = fold(q)
  if (!k) return []
  const words = k.split(' ')
  const num = digits(q)
  return patients
    .filter((p) => {
      if (num.length >= 3 && num === k.replace(/\s/g, '')) return digits(p.phone).includes(num) || p.id.includes(num)
      const hay = fold(p.name + ' ' + p.id + ' ' + p.phone)
      return words.every((w) => hay.includes(w))
    })
    .slice(0, limit)
}

// CCCD là duy nhất khi có (ERD). Trả hồ sơ đang giữ số này, trừ chính exceptId.
export const idNumberOwner = (idNumber, exceptId = null) => {
  const n = digits(idNumber)
  return n ? patients.find((p) => p.id !== exceptId && digits(p.idNumber) === n) ?? null : null
}

export function findDuplicates({ name, phone, dob }) {
  const ph = digits(phone)
  const nm = fold(name)
  return patients.filter((p) => (ph.length >= 9 && digits(p.phone) === ph) || (nm && dob && fold(p.name) === nm && p.dob === dob.trim()))
}

export function registerPatient(data, user) {
  const n = Math.max(100, ...patients.map((p) => +p.id.slice(2) || 0)) + 1
  const p = {
    id: codeOf(n),
    name: data.name.trim(),
    phone: digits(data.phone),
    dob: data.dob.trim(),
    gender: data.gender,
    allergies: data.allergies.trim(),
    history: data.history.trim(),
    pregnancy: data.pregnancy ?? '',
    idNumber: digits(data.idNumber)
  }
  commit([...patients, p])
  logEvent(user, 'patient.create', { target: { kind: 'patient', id: p.id, label: p.name }, params: { patient: p.name } })
  return p
}

// Sửa thông tin hành chính nhập nhầm lúc đăng ký thay vì tạo hồ sơ mới (tránh trùng); ghi nhật ký trước / sau.
// Dị ứng và bệnh nền do bác sĩ sửa (updatePatientClinical).
export const ADMIN_FIELDS = ['name', 'phone', 'dob', 'gender', 'idNumber']
export function updatePatientAdmin(id, fields, user) {
  const old = findPatient(id)
  if (!old) return { ok: false, error: 'Patient not found.' }
  const next = {}
  for (const k of ADMIN_FIELDS) if (k in fields) next[k] = k === 'phone' || k === 'idNumber' ? digits(fields[k]) : String(fields[k] ?? '').trim()
  if (next.idNumber && idNumberOwner(next.idNumber, id)) return { ok: false, error: 'This ID card number already belongs to another patient record.' }
  if ('name' in next && !next.name) return { ok: false, error: 'Enter the full name.' }
  const changed = Object.keys(next).filter((k) => (old[k] ?? '') !== next[k])
  if (!changed.length) return { ok: true, changed: false }
  commit(patients.map((p) => (p.id === id ? { ...p, ...next } : p)))
  logEvent(user, 'patient.update', {
    target: { kind: 'patient', id, label: old.name },
    params: { patient: old.name, fields: changed.join(', ') },
    before: Object.fromEntries(changed.map((k) => [k, old[k] ?? ''])),
    after: Object.fromEntries(changed.map((k) => [k, next[k]]))
  })
  return { ok: true, changed: true }
}

// Dị ứng / bệnh nền bác sĩ phát hiện khi khám được lưu vào hồ sơ để lần sau kiểm tra đơn vẫn thấy.
// Lễ tân chỉ ghi lời khai; bác sĩ xác nhận / sửa.
export function updatePatientClinical(id, { allergies, history }, user) {
  const old = findPatient(id)
  if (!old) return { ok: false, error: 'Patient not found.' }
  const next = { allergies: allergies.trim(), history: history.trim() }
  if (next.allergies === (old.allergies ?? '') && next.history === (old.history ?? '')) return { ok: true, changed: false }
  commit(patients.map((p) => (p.id === id ? { ...p, ...next } : p)))
  logEvent(user, 'patient.clinical_update', {
    target: { kind: 'patient', id, label: old.name },
    params: { patient: old.name, allergies: next.allergies || '—', history: next.history || '—' },
    before: { allergies: old.allergies ?? '', history: old.history ?? '' },
    after: next,
    level: next.allergies !== (old.allergies ?? '') ? 'warning' : undefined
  })
  return { ok: true, changed: true }
}

// Mang thai lưu ở hồ sơ ('yes' | 'no' | '' = chưa hỏi); lễ tân hỏi lại mỗi lần tiếp đón.
export function setPregnancy(id, pregnancy, user) {
  const old = findPatient(id)
  if (!old) return { ok: false, error: 'Patient not found.' }
  if ((old.pregnancy ?? '') === pregnancy) return { ok: true, changed: false }
  commit(patients.map((p) => (p.id === id ? { ...p, pregnancy } : p)))
  logEvent(user, 'patient.update', {
    target: { kind: 'patient', id, label: old.name },
    params: { patient: old.name, fields: 'pregnancy' },
    before: { pregnancy: old.pregnancy ?? '' },
    after: { pregnancy }
  })
  return { ok: true, changed: true }
}
