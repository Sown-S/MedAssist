// ĐÂY LÀ LỚP GIẢ LẬP (demo) cho bảng INVOICE / INVOICE_ITEM — đúng luồng backend lượt 6b/6c:
//  - Hoá đơn TỰ TẠO ở trạng thái 'pending' khi lượt khám sang Prescribed (bác sĩ chốt đơn / hoàn tất khám);
//  - Dòng hoá đơn: item_type 'Drug' (từ dòng đơn, giữ rx_index) | 'Consultation' | 'Paraclinical' (nhập tay — siêu âm, xét nghiệm…);
//    tên + đơn giá CHÉP vào dòng, nên đổi giá danh mục sau này không làm đổi hoá đơn đã lập;
//  - consultation_fee / paraclinical_fee / drug_fee = tổng từng loại; total = tổng ba loại (CHECK trong CSDL);
//  - 'pending' → 'paid' (POST /visits/{id}/invoice/pay, hình thức Cash | BankingTransfer); 'cancelled' kèm lý do;
//  - Một lượt chỉ có MỘT hoá đơn chưa huỷ: đổi dòng (bỏ qua thuốc khi cấp phát) = huỷ hoá đơn cũ + lập lại.
// Backend thật: GET/PATCH /visits/{id}/invoice, POST …/invoice/pay, GET …/invoice/print.
import { useSyncExternalStore } from 'react'
import { nextNumber, getSettings } from './settingsStore'
import { logEvent } from './activityStore'

const KEY = 'medassist_invoices_v1'

const p2 = (n) => String(n).padStart(2, '0')
const at = (daysAgo, h, m) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
export const dayOf = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

// Dòng hoá đơn mẫu (đơn giá khớp Danh mục thuốc).
const FEE = () => ({ item_type: 'Consultation', name: 'Consultation fee', qty: 1, amount: getSettings().ops.consultFee })
const DRUGS = {
  throat: [
    { name: 'Amoxicillin 500mg', qty: 20, amount: 50000 },
    { name: 'Paracetamol 500mg', qty: 10, amount: 10000 }
  ],
  gastric: [{ name: 'Omeprazol 20mg', qty: 14, amount: 56000 }],
  diabetes: [{ name: 'Metformin 500mg', qty: 60, amount: 72000 }],
  rash: [{ name: 'Loratadin 10mg', qty: 10, amount: 15000 }],
  pain: [{ name: 'Ibuprofen 400mg', qty: 10, amount: 15000 }]
}
export const sampleItems = (kind) => [FEE(), ...(DRUGS[kind] ?? [])]
const sum = (items) => items.reduce((s, x) => s + x.amount, 0)
// Loại dòng của dữ liệu cũ chưa có item_type.
export const itemType = (x) => x.item_type ?? (x.name === 'Consultation fee' ? 'Consultation' : 'Drug')
export function subtotals(items) {
  const by = (t) => items.filter((x) => itemType(x) === t).reduce((n, x) => n + x.amount, 0)
  const consultation_fee = by('Consultation')
  const paraclinical_fee = by('Paraclinical')
  const drug_fee = by('Drug')
  return { consultation_fee, paraclinical_fee, drug_fee, total: consultation_fee + paraclinical_fee + drug_fee }
}

// Hoá đơn những ngày trước: [ngày trước, giờ, phút, họ tên, SĐT, mã BN, loại đơn, hình thức, huỷ?]
const PAST = [
  [6, 8, 40, 'Nguyễn Văn Thành', '0967622357', 'BN000114', 'throat', 'cash'],
  [6, 10, 5, 'Hồ Thu Ngành', '0339798182', 'BN000116', 'rash', 'transfer'],
  [5, 9, 15, 'Lê Văn Nam', '0339698780', 'BN000115', 'diabetes', 'cash'],
  [4, 14, 30, 'Lê Quốc Bảo', '0989456231', 'BN000102', 'gastric', 'transfer'],
  [3, 8, 20, 'Phan Thị Ngọc', '0868234567', 'BN000111', 'throat', 'cash', 'Wrong amount — re-issued'],
  [3, 8, 35, 'Phan Thị Ngọc', '0868234567', 'BN000111', 'throat', 'cash'],
  [2, 15, 10, 'Đỗ Văn Khánh', '0903456789', 'BN000112', 'pain', 'cash'],
  [1, 9, 45, 'Bùi Văn Long', '0977001122', 'BN000106', 'diabetes', 'transfer'],
  [1, 11, 0, 'Trần Văn Hùng', '0912345678', 'BN000108', 'throat', 'cash']
]

function seed() {
  const out = []
  for (const [days, h, m, name, phone, patientId, kind, method, cancelled] of PAST) {
    const created = at(days, h, m)
    const items = sampleItems(kind)
    out.push({
      id: nextNumber('invoice', out.map((x) => x.id), new Date(created)),
      visitId: null,
      patientId,
      name,
      phone,
      ticket: null,
      doctor: days % 2 ? 'Trần Minh' : 'Nguyễn Văn Dũng',
      items,
      total: sum(items),
      method,
      ref: method === 'transfer' ? 'FT26' + String(1000000 + days * 1311 + m).slice(-7) : '',
      status: cancelled ? 'cancelled' : 'paid',
      createdAt: created,
      paidAt: created,
      by: null,
      byName: 'Nguyễn Thị Mai',
      cancel: cancelled ? { at: at(days, h, m + 10), by: 'Nguyễn Thị Mai', reason: cancelled } : null
    })
  }
  return out
}

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY))
    // Bản cũ: 'processing' (lập hoá đơn chờ tiền chuyển khoản) = hoá đơn 'pending' đã chọn hình thức chuyển khoản.
    return list?.map((x) => (x.status === 'processing' ? { ...x, status: 'pending' } : x)) ?? null
  } catch {
    return null
  }
}
let invoices = read() ?? seed()
const listeners = new Set()
function commit(next) {
  invoices = next
  try {
    localStorage.setItem(KEY, JSON.stringify(invoices))
  } catch {
    /* chỉ giữ trong phiên */
  }
  listeners.forEach((fn) => fn())
}
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getInvoices = () => invoices
export function useInvoices() {
  return useSyncExternalStore(subscribe, getInvoices)
}
export const invoiceById = (id) => invoices.find((x) => x.id === id)

export const activeInvoiceOf = (visitId) => invoices.find((x) => x.visitId === visitId && x.status !== 'cancelled') ?? null

// Lập hoá đơn. status: 'pending' (tự tạo khi Prescribed, chưa thu) | 'paid' (dữ liệu mẫu đã thu).
// user = null: hoá đơn mẫu của ngày hôm nay (tạo cùng hàng chờ mẫu).
export function issueInvoice(visit, { items, method = null, ref = '', status = 'pending', createdAt }, user) {
  const now = createdAt ?? new Date().toISOString()
  const totals = subtotals(items)
  const total = totals.total
  const inv = {
    id: nextNumber('invoice', invoices.map((x) => x.id), new Date(now)),
    ...totals,
    visitId: visit.id,
    patientId: visit.patientId,
    name: visit.name,
    phone: visit.phone ?? '',
    ticket: visit.ticket,
    doctor: visit.doctor,
    items,
    total,
    method,
    ref,
    status,
    createdAt: now,
    paidAt: status === 'paid' ? now : null,
    by: user?.id ?? null,
    byName: user?.name ?? 'Nguyễn Thị Mai',
    cancel: null
  }
  commit([inv, ...invoices])
  if (user)
    logEvent(user, 'invoice.issue', {
      target: { kind: 'invoice', id: inv.id, label: inv.name },
      params: { invoice: inv.id, patient: inv.name, amount: total, method, status }
    })
  return inv
}

// Thu tiền (POST /visits/{id}/invoice/pay): 'pending' → 'paid'. method: 'cash' | 'transfer'.
export function payInvoice(id, { method, ref = '' }, user) {
  const inv = invoiceById(id)
  if (inv?.status !== 'pending') return { ok: false, error: 'This invoice is not waiting for payment.' }
  if (!['cash', 'transfer'].includes(method)) return { ok: false, error: 'Choose a payment method.' }
  const now = new Date().toISOString()
  commit(invoices.map((x) => (x.id === id ? { ...x, status: 'paid', method, paidAt: now, ref: ref?.trim() || x.ref, by: user.id, byName: user.name } : x)))
  logEvent(user, 'invoice.confirm', { target: { kind: 'invoice', id, label: inv.name }, params: { invoice: id, patient: inv.name, amount: inv.total } })
  return { ok: true, invoice: invoiceById(id) }
}
// Ghi nhận hình thức "chuyển khoản — chờ tiền về" trên hoá đơn còn pending (chưa thu).
export function setInvoiceMethod(id, method, ref, user) {
  const inv = invoiceById(id)
  if (inv?.status !== 'pending') return { ok: false, error: 'This invoice is not waiting for payment.' }
  commit(invoices.map((x) => (x.id === id ? { ...x, method, ref: ref?.trim() ?? x.ref } : x)))
  return { ok: true }
}
// Thay các dòng của hoá đơn còn pending (sửa dòng dịch vụ) — tính lại tổng phụ và tổng.
export function replaceInvoiceItems(id, items, user) {
  const inv = invoiceById(id)
  if (inv?.status !== 'pending') return { ok: false, error: 'This invoice can no longer be changed.' }
  const totals = subtotals(items)
  commit(invoices.map((x) => (x.id === id ? { ...x, items, ...totals } : x)))
  logEvent(user, 'invoice.update', { target: { kind: 'invoice', id, label: inv.name }, params: { invoice: id, patient: inv.name, amount: totals.total } })
  return { ok: true }
}
// Giữ tên cũ cho màn Hoá đơn: tiền chuyển khoản đã về → thu.
export const confirmInvoice = (id, ref, user) => payInvoice(id, { method: invoiceById(id)?.method || 'transfer', ref }, user)

// approvedBy: Quản trị viên xác nhận tại quầy (bắt buộc khi huỷ hoá đơn ĐÃ THU do người không phải Quản trị viên thực hiện).
// restocked: bệnh nhân đã trả lại thuốc và thuốc được nhập lại kho.
export function cancelInvoice(id, reason, user, { approvedBy = null, restocked = false } = {}) {
  const inv = invoiceById(id)
  if (!inv || inv.status === 'cancelled') return { ok: false, error: 'This invoice cannot be cancelled.' }
  if (!reason.trim()) return { ok: false, error: 'Enter a reason for cancelling.' }
  commit(invoices.map((x) => (x.id === id ? { ...x, status: 'cancelled', cancel: { at: new Date().toISOString(), by: user.name, reason: reason.trim(), approvedBy, restocked } } : x)))
  logEvent(user, 'invoice.void', {
    target: { kind: 'invoice', id, label: inv.name },
    params: { invoice: id, patient: inv.name, amount: inv.total, reason: reason.trim(), approvedBy: approvedBy ?? '', restocked },
    level: 'warning'
  })
  return { ok: true, invoice: inv }
}
