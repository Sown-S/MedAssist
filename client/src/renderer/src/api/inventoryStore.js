// ĐÂY LÀ LỚP GIẢ LẬP (demo) cho các bảng của backend:
//   drugs          — danh mục thuốc & vật tư (dữ liệu gốc: tên, hoạt chất, ATC, đơn vị, giá, thiết yếu)
//   inventory_batch — tồn kho THEO LÔ (số lô, hạn dùng, số lượng còn, ngày nhập, giá nhập) — POST /inventory/batches
//   stock_movement  — thẻ kho (sổ cái chỉ ghi thêm): nhập / xuất / hoàn kho, kèm người thao tác
// Không quản lý nhà cung cấp, công nợ, kiểm kho (Proposal §6.2 — ngoài phạm vi).
// Lưu tạm trong localStorage để thao tác demo không mất khi chuyển trang.
// Backend thật: thay các hàm ghi bằng POST/PATCH; xuất kho FEFO và chặn lô hết hạn PHẢI kiểm lại ở server.
import { useSyncExternalStore } from 'react'
import { getSettings } from './settingsStore'
import { logEvent } from './activityStore'

// v3: bỏ nhà cung cấp, phiếu nhập, công nợ, kiểm kho (dữ liệu v2 cũ được tạo lại từ đầu).
const KEY = 'medassist_inventory_v3'

export const todayISO = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
// Lùi/tiến n ngày so với hôm nay — để dữ liệu mẫu luôn "đúng thời điểm" dù mở app ngày nào.
function shift(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
// Hạn dùng ghi trên bao bì dạng MM/YYYY = hết ngày cuối cùng của tháng đó.
export function endOfMonth(mm, yyyy) {
  const d = new Date(yyyy, mm, 0)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ---------- Dữ liệu mẫu ----------
// use30 = số đơn vị đã xuất 30 ngày gần nhất (lấy từ báo cáo thuốc dùng nhiều) → tính số ngày còn đủ dùng.
const SEED_DRUGS = [
  { id: 'D01', name: 'Paracetamol 500mg', ingredient: 'Paracetamol', atc: 'N02BE01', unit: 'tablet', kind: 'drug', group: 'regular', essential: false, cost: 400, price: 1000, threshold: 500, use30: 1800 },
  { id: 'D02', name: 'Amoxicillin 500mg', ingredient: 'Amoxicillin', atc: 'J01CA04', unit: 'capsule', kind: 'drug', group: 'regular', essential: true, cost: 1200, price: 2500, threshold: 100, use30: 240 },
  { id: 'D03', name: 'Vitamin C effervescent', ingredient: 'Ascorbic acid 1000mg', atc: 'A11GA01', unit: 'tube', kind: 'drug', group: 'regular', essential: false, cost: 38000, price: 65000, threshold: 20, use30: 25 },
  { id: 'D04', name: 'Tramadol 50mg', ingredient: 'Tramadol hydrochloride', atc: 'N02AX02', unit: 'capsule', kind: 'drug', group: 'controlled', essential: false, cost: 2000, price: 4000, threshold: 50, use30: 60 },
  { id: 'D05', name: 'Cefuroxim 500mg', ingredient: 'Cefuroxime axetil', atc: 'J01DC02', unit: 'tablet', kind: 'drug', group: 'regular', essential: true, cost: 5000, price: 9000, threshold: 100, use30: 150 },
  { id: 'D06', name: 'Omeprazol 20mg', ingredient: 'Omeprazole', atc: 'A02BC01', unit: 'capsule', kind: 'drug', group: 'regular', essential: false, cost: 1500, price: 4000, threshold: 80, use30: 210 },
  { id: 'D07', name: 'Diazepam 5mg', ingredient: 'Diazepam', atc: 'N05BA01', unit: 'tablet', kind: 'drug', group: 'controlled', essential: false, cost: 500, price: 1500, threshold: 30, use30: 20 },
  { id: 'D08', name: 'Ibuprofen 400mg', ingredient: 'Ibuprofen', atc: 'M01AE01', unit: 'tablet', kind: 'drug', group: 'regular', essential: false, cost: 700, price: 1500, threshold: 200, use30: 300 },
  { id: 'D09', name: 'Loratadin 10mg', ingredient: 'Loratadine', atc: 'R06AX13', unit: 'tablet', kind: 'drug', group: 'regular', essential: false, cost: 600, price: 1500, threshold: 100, use30: 90 },
  { id: 'D10', name: 'Oresol 245', ingredient: 'Oral rehydration salts', atc: 'A07CA', unit: 'sachet', kind: 'drug', group: 'regular', essential: true, cost: 2000, price: 4000, threshold: 50, use30: 70 },
  { id: 'D11', name: 'Salbutamol 2mg', ingredient: 'Salbutamol', atc: 'R03CC02', unit: 'tablet', kind: 'drug', group: 'regular', essential: false, cost: 300, price: 800, threshold: 100, use30: 40 },
  { id: 'D12', name: 'Metformin 500mg', ingredient: 'Metformin hydrochloride', atc: 'A10BA02', unit: 'tablet', kind: 'drug', group: 'regular', essential: true, cost: 500, price: 1200, threshold: 200, use30: 450 },
  { id: 'D13', name: 'Sodium chloride 0.9% 500ml', ingredient: 'Sodium chloride', atc: 'B05BB01', unit: 'bottle', kind: 'drug', group: 'regular', essential: false, cost: 9000, price: 15000, threshold: 20, use30: 12 },
  { id: 'D14', name: 'Sterile gauze 10×10cm', ingredient: '', atc: '', unit: 'pack', kind: 'supply', group: 'regular', essential: false, cost: 3000, price: 6000, threshold: 50, use30: 80 },
  { id: 'D15', name: 'Cetirizin 10mg', ingredient: 'Cetirizine', atc: 'R06AE07', unit: 'tablet', kind: 'drug', group: 'regular', essential: false, cost: 500, price: 1200, threshold: 0, use30: 0, active: false }
]

// [drugId, số lô, hạn dùng, nhập lúc (số ngày trước), SL nhập, SL còn]
const SEED_BATCHES = [
  ['D01', 'PA2501', endOfMonth(12, 2027), 120, 3000, 1500, 0],
  ['D01', 'PA2507', endOfMonth(6, 2028), 25, 3000, 3000, 1],
  ['D02', 'AM2403', endOfMonth(9, 2026), 300, 200, 30, 0], // đã hết hạn
  ['D02', 'AM2508', endOfMonth(3, 2027), 40, 100, 55, 2],
  ['D03', 'VC2506', endOfMonth(6, 2028), 60, 40, 30, 3],
  ['D04', 'TR2502', endOfMonth(3, 2027), 150, 200, 120, 1],
  ['D05', 'CF2504', endOfMonth(1, 2028), 90, 300, 210, 1],
  ['D06', 'OM2411', endOfMonth(11, 2027), 200, 200, 60, 2],
  ['D07', 'DZ2410', endOfMonth(10, 2026), 360, 100, 40, 1], // hết hạn trong tháng này
  ['D08', 'IB2505', endOfMonth(12, 2026), 130, 500, 180, 3],
  ['D08', 'IB2509', endOfMonth(9, 2028), 10, 300, 300, 3],
  ['D09', 'LO2503', endOfMonth(2, 2027), 180, 300, 140, 2],
  ['D10', 'OR2505', endOfMonth(11, 2026), 120, 200, 45, 0],
  ['D11', 'SB2407', endOfMonth(8, 2026), 400, 200, 25, 2], // đã hết hạn — toàn bộ tồn đều hỏng
  ['D12', 'MF2506', endOfMonth(6, 2027), 100, 1000, 380, 3],
  ['D13', 'NC2508', endOfMonth(8, 2028), 55, 40, 26, 4],
  ['D14', 'GZ2504', endOfMonth(4, 2029), 160, 300, 160, 4]
]

const STAFF = { admin: 'Trần Thị Lan', pharm: 'Đinh Văn Dũng', doc: 'Trần Minh' }

// Giới hạn liều (để kiểm tra liều theo cân nặng khi kê đơn): strengthMg = mg hoạt chất / 1 đơn vị;
// maxMgDay = liều tối đa / ngày (người lớn); maxMgKgDay = liều tối đa mg/kg/ngày (trẻ em); controlledType: 'N' gây nghiện | 'H' hướng thần.
// SỐ LIỆU MẪU — Quản trị viên phải đối chiếu Dược thư Quốc gia / tờ hướng dẫn sử dụng trước khi dùng thật.
export const SEED_DOSING = {
  D01: { strengthMg: 500, maxMgDay: 4000, maxMgKgDay: 60 },
  D02: { strengthMg: 500, maxMgDay: 3000, maxMgKgDay: 90 },
  D04: { strengthMg: 50, maxMgDay: 400, maxMgKgDay: null, controlledType: 'N' },
  D05: { strengthMg: 500, maxMgDay: 1000, maxMgKgDay: 30 },
  D06: { strengthMg: 20, maxMgDay: 40, maxMgKgDay: 1 },
  D07: { strengthMg: 5, maxMgDay: 30, maxMgKgDay: null, controlledType: 'H' },
  D08: { strengthMg: 400, maxMgDay: 2400, maxMgKgDay: 30 },
  D09: { strengthMg: 10, maxMgDay: 10, maxMgKgDay: null },
  D11: { strengthMg: 2, maxMgDay: 16, maxMgKgDay: 0.3 },
  D12: { strengthMg: 500, maxMgDay: 2550, maxMgKgDay: null }
}

function seed() {
  const stamp = { updatedAt: shift(-90) + 'T08:00:00', updatedBy: STAFF.admin }
  const drugs = SEED_DRUGS.map((d) => ({ active: true, ...stamp, ...SEED_DOSING[d.id], ...d }))
  const batches = []
  const moves = []
  let mv = 0
  SEED_BATCHES.forEach(([drugId, lot, expiry, ago, qtyIn, qtyLeft], i) => {
    const d = drugs.find((x) => x.id === drugId)
    const id = 'B' + String(i + 1).padStart(3, '0')
    const date = shift(-ago)
    batches.push({ id, drugId, lot, expiry, qty: qtyLeft, receivedAt: date, cost: d.cost })
    moves.push({ id: 'M' + ++mv, at: date + 'T08:30:00', drugId, batchId: id, lot, type: 'in', qty: qtyIn, ref: id, by: STAFF.pharm, note: '' })
    // Rải phần đã xuất thành vài phiếu xuất bán theo đơn.
    let out = qtyIn - qtyLeft
    const parts = Math.min(4, Math.max(1, Math.round(out / 40)))
    for (let k = 0; k < parts && out > 0; k++) {
      const q = k === parts - 1 ? out : Math.ceil(out / (parts - k))
      out -= q
      const day = -Math.max(1, Math.round(ago - ((k + 1) * ago) / (parts + 1)))
      moves.push({ id: 'M' + ++mv, at: shift(day) + 'T' + String(9 + k).padStart(2, '0') + ':15:00', drugId, batchId: id, lot, type: 'out', qty: -q, ref: 'HD-' + (4100 + mv), by: 'Nguyễn Thị Mai', note: 'Dispensed with invoice' })
    }
  })
  return { drugs, batches, moves: recomputeBalances(moves) }
}

// Tồn sau mỗi phiếu (theo từng thuốc, xếp theo thời gian) — cột "Tồn cuối" của thẻ kho.
function recomputeBalances(moves) {
  const sorted = [...moves].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
  const bal = {}
  for (const m of sorted) {
    bal[m.drugId] = (bal[m.drugId] ?? 0) + m.qty
    m.balance = bal[m.drugId]
  }
  return sorted.reverse()
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
function load() {
  const saved = read()
  if (!saved?.drugs) return seed()
  // Bản lưu từ phiên bản trước chưa có giới hạn liều (bổ sung từ dữ liệu mẫu, không ghi đè).
  const drugs = saved.drugs.map((d) => (d.strengthMg === undefined && SEED_DOSING[d.id] ? { ...SEED_DOSING[d.id], ...d } : d))
  return { ...saved, drugs }
}
let state = load()
const listeners = new Set()
function commit(next) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* chỉ giữ trong phiên */
  }
  listeners.forEach((fn) => fn())
}
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getInventory = () => state
export function useInventory() {
  return useSyncExternalStore(subscribe, getInventory)
}
export function resetInventoryDemo() {
  commit(seed())
}

// ---------- Tính toán tồn ----------
// Ngưỡng "sắp hết hạn": Cài đặt › Vận hành.
export const nearDays = () => getSettings().ops.nearDays
export function daysLeft(iso) {
  const t = new Date(todayISO() + 'T00:00:00')
  return Math.round((new Date(iso + 'T00:00:00') - t) / 86400000)
}

// Tóm tắt tồn của 1 thuốc: tách phần còn dùng được và phần đã hết hạn.
export function stockOf(drug, batches = state.batches, near = nearDays()) {
  const list = batches
    .filter((b) => b.drugId === drug.id && b.qty > 0)
    .map((b) => ({ ...b, days: daysLeft(b.expiry) }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry))
  const usableBatches = list.filter((b) => b.days >= 0)
  const usable = usableBatches.reduce((s, b) => s + b.qty, 0)
  const expired = list.filter((b) => b.days < 0).reduce((s, b) => s + b.qty, 0)
  const nearQty = usableBatches.filter((b) => b.days <= near).reduce((s, b) => s + b.qty, 0)
  const nextExpiry = usableBatches[0] ?? null
  const daily = (drug.use30 ?? 0) / 30
  const daysCover = daily > 0 ? Math.floor(usable / daily) : null
  // Mức tồn mục tiêu = ngưỡng an toàn + lượng dùng 30 ngày → gợi ý đặt thêm phần còn thiếu (làm tròn lên 10).
  const target = drug.threshold + Math.ceil(daily * 30)
  const reorder = drug.active && usable < drug.threshold ? Math.ceil((target - usable) / 10) * 10 : 0
  const statuses = []
  if (!drug.active) statuses.push('inactive')
  else {
    if (usable === 0) statuses.push('out')
    else if (usable < drug.threshold) statuses.push('low')
    if (nearQty > 0) statuses.push('near')
    if (expired > 0) statuses.push('expired')
    if (!statuses.length) statuses.push('ok')
  }
  return { batches: list, usable, expired, nearQty, nextExpiry, daily, daysCover, reorder, statuses, value: usableBatches.reduce((s, b) => s + b.qty * b.cost, 0) }
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()
export function findDrugByName(name, drugs = state.drugs) {
  const n = norm(name)
  return drugs.find((d) => norm(d.name) === n) ?? drugs.find((d) => n.startsWith(norm(d.name)) || norm(d.name).startsWith(n))
}

// ---------- Ghi ----------
function nextId(list, prefix, width = 3) {
  return prefix + String(Math.max(0, ...list.map((x) => +x.id.replace(/\D/g, '') || 0)) + 1).padStart(width, '0')
}
function addMoves(s, newMoves) {
  let n = Math.max(0, ...s.moves.map((m) => +m.id.slice(1)))
  const stamped = newMoves.map((m) => ({ ...m, id: 'M' + ++n, at: m.at ?? new Date().toISOString() }))
  return recomputeBalances([...s.moves, ...stamped])
}
const drugName = (id) => state.drugs.find((d) => d.id === id)?.name ?? id

export function upsertDrug(data, user) {
  const exists = data.id && state.drugs.some((d) => d.id === data.id)
  const id = exists ? data.id : nextId(state.drugs, 'D', 2)
  const stamp = { updatedAt: new Date().toISOString(), updatedBy: user.name }
  const drugs = exists ? state.drugs.map((d) => (d.id === id ? { ...d, ...data, ...stamp } : d)) : [...state.drugs, { active: true, use30: 0, ...data, ...stamp, id }]
  commit({ ...state, drugs })
  logEvent(user, exists ? 'drug.update' : 'drug.create', { target: { kind: 'drug', id, label: data.name }, params: { drug: data.name } })
  return id
}
export function setDrugActive(id, active, user, note) {
  commit({ ...state, drugs: state.drugs.map((d) => (d.id === id ? { ...d, active, updatedAt: new Date().toISOString(), updatedBy: user.name } : d)) })
  logEvent(user, active ? 'drug.reactivate' : 'drug.discontinue', { target: { kind: 'drug', id, label: drugName(id) }, params: { drug: drugName(id), note }, before: !active, after: active })
}

// Nhập 1 lô mới (backend: POST /inventory/batches — batch_number, expiry_date, initial_quantity, import_price).
export function receiveStock({ drugId, lot, expiry, qty, cost }, user) {
  const id = nextId(state.batches, 'B')
  const at = new Date().toISOString()
  const batches = [...state.batches, { id, drugId, lot, expiry, qty, receivedAt: todayISO(), cost }]
  const moves = addMoves(state, [{ at, drugId, batchId: id, lot, type: 'in', qty, ref: id, by: user.name, note: '' }])
  commit({ ...state, batches, moves })
  logEvent(user, 'stock.receive', { target: { kind: 'drug', id: drugId, label: drugName(drugId) }, params: { drug: drugName(drugId), lot, qty, ref: id, supplier: '' } })
  return id
}

// ---------- Trừ kho khi bác sĩ CHỐT ĐƠN (backend lượt 6b: POST /visits/{id}/prescription/confirm) ----------
// Lô ĐỦ ĐIỀU KIỆN cho một đợt dùng thuốc: còn hạn qua hết đợt — hạn dùng > hôm nay + max(số ngày dùng, khoảng an toàn
// trong Cài đặt › Vận hành). Lô còn 3 ngày không bao giờ được cấp cho đợt 7 ngày (ERD: trigger trên sổ cái kiểm lại lần nữa).
export const shelfBuffer = () => Number(getSettings().ops.shelfBufferDays) || 0
export function eligibleFor(b, days = 0) {
  const need = Math.max(Number(days) || 0, shelfBuffer())
  const left = daysLeft(b.expiry)
  return need > 0 ? left > need : left >= 0
}

// lines: [{ key, drugId, qty, days }] — key = định danh dòng đơn (để trả về phân bổ theo từng dòng).
// Một giao dịch: thiếu BẤT KỲ dòng nào → không trừ gì cả, trả { ok: false, short: [{ key, drugId, need, usable, reason }] }
// reason: 'out' (hết hàng) | 'expiring' (còn hàng nhưng hết hạn trước khi hết đợt dùng) | 'inactive' (thuốc ngừng dùng).
// Đủ → trừ FEFO (hết hạn trước xuất trước) và trả { ok: true, alloc: { [key]: [{ batchId, lot, expiry, qty }] } }.
export function deductForCourse(lines, ref, user) {
  let batches = state.batches
  const newMoves = []
  const short = []
  const alloc = {}
  for (const { key, drugId, qty, days } of lines) {
    const d = state.drugs.find((x) => x.id === drugId)
    const inStock = batches.filter((b) => b.drugId === drugId && b.qty > 0 && daysLeft(b.expiry) >= 0)
    const ok = inStock.filter((b) => eligibleFor(b, days)).sort((a, b) => a.expiry.localeCompare(b.expiry))
    const usable = ok.reduce((n, b) => n + b.qty, 0)
    if (!d?.active || usable < qty) {
      short.push({ key, drugId, need: qty, usable, reason: !d?.active ? 'inactive' : inStock.reduce((n, b) => n + b.qty, 0) >= qty ? 'expiring' : 'out' })
      continue
    }
    let need = qty
    alloc[key] = []
    for (const b of ok) {
      if (!need) break
      const take = Math.min(need, b.qty)
      need -= take
      batches = batches.map((x) => (x.id === b.id ? { ...x, qty: x.qty - take } : x))
      alloc[key].push({ batchId: b.id, lot: b.lot, expiry: b.expiry, qty: take })
      newMoves.push({ drugId, batchId: b.id, lot: b.lot, type: 'out', qty: -take, ref, by: user.name, note: 'Deducted at prescription confirmation' })
    }
  }
  if (short.length) return { ok: false, short }
  if (newMoves.length) {
    commit({ ...state, batches, moves: addMoves(state, newMoves) })
    const summary = lines.map((l) => `${drugName(l.drugId)} ×${l.qty}`).join(', ')
    logEvent(user, 'stock.dispense', { target: { kind: 'invoice', id: ref }, params: { ref, summary } })
  }
  return { ok: true, alloc }
}

// Hoàn kho về ĐÚNG các lô đã trừ (dòng bị bỏ qua khi cấp phát, mở lại / huỷ đơn) — ghi thẻ kho loại "Hoàn kho".
export function restoreAllocations(allocs, ref, user, note = 'Returned to stock') {
  const flat = allocs.flat().filter((a) => a && a.qty > 0)
  if (!flat.length) return { ok: true }
  const batches = state.batches.map((b) => {
    const q = flat.filter((a) => a.batchId === b.id).reduce((n, a) => n + a.qty, 0)
    return q ? { ...b, qty: b.qty + q } : b
  })
  const moves = addMoves(
    state,
    flat.map((a) => {
      const b = state.batches.find((x) => x.id === a.batchId)
      return { drugId: b?.drugId, batchId: a.batchId, lot: a.lot, type: 'return', qty: a.qty, ref, by: user.name, note }
    })
  )
  commit({ ...state, batches, moves })
  logEvent(user, 'stock.return', { target: { kind: 'invoice', id: ref }, params: { ref, summary: flat.map((a) => `${a.lot} ×${a.qty}`).join(', ') } })
  return { ok: true }
}

// Thuốc KÊ ĐƠN: lễ tân bán qua quầy (theo đơn giấy / bán lẻ) phải ghi người / nơi kê đơn.
// Mặc định: kháng sinh toàn thân (ATC J01) và thuốc kiểm soát đặc biệt; Quản trị viên bật / tắt riêng từng thuốc (rxOnly).
export const isRxOnly = (d) => !!d && d.kind !== 'supply' && (d.rxOnly ?? (d.group === 'controlled' || /^J01/.test(d.atc ?? '')))

// Thuốc đã xuất theo 1 chứng từ (số hoá đơn) mà CHƯA hoàn lại, theo từng lô: [{ drugId, batchId, lot, qty }].
export function dispensedFor(ref) {
  const left = new Map()
  for (const m of state.moves) {
    if (m.ref !== ref || (m.type !== 'out' && m.type !== 'return')) continue
    const cur = left.get(m.batchId) ?? { drugId: m.drugId, batchId: m.batchId, lot: m.lot, qty: 0 }
    cur.qty -= m.qty // out: qty âm → cộng; return: qty dương → trừ
    left.set(m.batchId, cur)
  }
  return [...left.values()].filter((x) => x.qty > 0)
}

// Huỷ hoá đơn mà bệnh nhân trả lại thuốc → nhập lại ĐÚNG lô đã xuất (giữ hạn dùng, giá vốn), ghi thẻ kho loại "Hoàn kho".
// Backend thật: làm trong cùng giao dịch với PATCH /invoices/{id}/cancel.
export function returnDispensed(ref, user) {
  const lines = dispensedFor(ref)
  if (!lines.length) return { ok: true, lines: [] }
  const batches = state.batches.map((b) => {
    const l = lines.find((x) => x.batchId === b.id)
    return l ? { ...b, qty: b.qty + l.qty } : b
  })
  const moves = addMoves(
    state,
    lines.map((l) => ({ drugId: l.drugId, batchId: l.batchId, lot: l.lot, type: 'return', qty: l.qty, ref, by: user.name, note: 'Returned — invoice cancelled' }))
  )
  commit({ ...state, batches, moves })
  const summary = lines.map((l) => `${drugName(l.drugId)} ×${l.qty}`).join(', ')
  logEvent(user, 'stock.return', { target: { kind: 'invoice', id: ref }, params: { ref, summary } })
  return { ok: true, lines }
}

// Lý do điều chỉnh tồn trong dữ liệu cũ của thẻ kho (chỉ để hiển thị).
const REASONS = { lost: 'Lost', damaged: 'Broken / damaged', expired: 'Expired, not yet disposed', entry: 'Data entry error at receipt', dispense: 'Dispensing error', other: 'Other (explain in note)' }
export const reasonLabel = (k) => REASONS[k] ?? ''
