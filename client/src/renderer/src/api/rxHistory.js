// Lịch sử đơn thuốc của bản demo: hàng chờ chỉ giữ hôm nay, sang ngày mới các lượt có đơn được chép vào đây.
import { useSyncExternalStore } from 'react'
import { getInvoices, dayOf } from './invoiceStore'
import { getPatients, ageOf } from './patientStore'

const KEY = 'medassist_rx_history_v1'

// Đơn mẫu: tên thuốc khớp danh mục để tính tiền; cách dùng viết tiếng Việt vì đơn in cho bệnh nhân.
const dose = (m, n, a, e, days, meal = 'after') => ({ m: m ? String(m) : '', n: n ? String(n) : '', a: a ? String(a) : '', e: e ? String(e) : '', days: String(days), meal })
export const RX = {
  throat: [
    { name: 'Amoxicillin 500mg', qty: 20, unit: 'caps', usage: 'Sáng 1 viên nang, Tối 1 viên nang — uống sau ăn — 10 ngày', dose: dose(1, 0, 0, 1, 10) },
    { name: 'Paracetamol 500mg', qty: 10, unit: 'tabs', usage: 'Uống khi sốt trên 38,5°C, cách nhau ít nhất 4–6 giờ' }
  ],
  gastric: [{ name: 'Omeprazol 20mg', qty: 14, unit: 'caps', usage: 'Sáng 1 viên nang — uống trước ăn — 14 ngày', dose: dose(1, 0, 0, 0, 14, 'before') }],
  diabetes: [{ name: 'Metformin 500mg', qty: 60, unit: 'tabs', usage: 'Sáng 1 viên, Tối 1 viên — uống sau ăn — 30 ngày', dose: dose(1, 0, 0, 1, 30) }],
  rash: [{ name: 'Loratadin 10mg', qty: 10, unit: 'tabs', usage: 'Tối 1 viên — 10 ngày', dose: dose(0, 0, 0, 1, 10, '') }],
  pain: [{ name: 'Ibuprofen 400mg', qty: 10, unit: 'tabs', usage: 'Uống khi đau, sau ăn, tối đa 3 lần/ngày' }]
}
const LINE = Object.fromEntries(Object.values(RX).flat().map((l) => [l.name, l]))

const record = (v, day) => ({
  id: v.id,
  day,
  rxAt: v.rxAt ?? v.statusAt,
  ticket: v.ticket ?? null,
  patientId: v.patientId,
  name: v.name,
  phone: v.phone ?? '',
  gender: v.gender ?? '',
  age: v.age ?? '',
  allergies: v.allergies ?? '',
  history: v.history ?? '',
  reason: v.reason ?? '',
  diagnosis: v.diagnosis ?? '',
  diagnosesExtra: v.diagnosesExtra ?? [],
  hpi: v.hpi ?? '',
  exam: v.exam ?? '',
  plan: v.plan ?? '',
  vitals: v.vitals ?? null,
  followUp: v.followUp ?? '',
  labOrders: v.labOrders ?? [],
  labResult: v.labResult ?? '',
  doctor: v.doctor ?? '',
  doctorId: v.doctorId ?? null,
  rx: v.rx,
  invoiceId: v.invoiceId ?? null
})

function seed() {
  const today = dayOf(new Date().toISOString())
  const dir = getPatients()
  return getInvoices()
    .filter((x) => !x.visitId && x.status !== 'cancelled' && dayOf(x.createdAt) < today && x.items.some((it) => LINE[it.name]))
    .map((x) => {
      const p = dir.find((d) => d.id === x.patientId)
      const rxAt = new Date(new Date(x.createdAt).getTime() - 10 * 60000).toISOString()
      return record(
        {
          id: 'rxh-' + x.id,
          rxAt,
          patientId: x.patientId,
          name: x.name,
          phone: x.phone,
          gender: p?.gender ?? '',
          age: p ? ageOf(p.dob) : '',
          allergies: p?.allergies ?? '',
          history: p?.history ?? '',
          doctor: x.doctor,
          rx: x.items.filter((it) => LINE[it.name]).map((it) => ({ ...LINE[it.name], qty: it.qty })),
          invoiceId: x.id
        },
        dayOf(rxAt)
      )
    })
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
let history = read() ?? seed()
const listeners = new Set()
function commit(next) {
  history = next
  try {
    localStorage.setItem(KEY, JSON.stringify(history))
  } catch {/* không lưu được thì chỉ giữ trong phiên */}
  listeners.forEach((fn) => fn())
}
commit(history)
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getRxHistory = () => history
export function useRxHistory() {
  return useSyncExternalStore(subscribe, getRxHistory)
}

export function archiveVisits(visits, day) {
  const have = new Set(history.map((r) => r.id))
  const fresh = visits.filter((v) => v.rx?.length && !have.has(v.id)).map((v) => record(v, day))
  if (fresh.length) commit([...fresh, ...history])
}
