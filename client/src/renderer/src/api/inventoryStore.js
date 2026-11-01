// Kho thuốc đọc từ server: danh mục thuốc, tồn theo lô, thẻ kho (nạp theo từng thuốc). Xuất kho FEFO, chặn lô hết hạn,
// trừ / hoàn kho đều do server làm khi xác nhận đơn và cấp phát.
import { useEffect, useSyncExternalStore } from 'react'
import { getSettings } from './settingsStore'
import { apiGet, apiPost, apiRequest, ApiError } from './client'

export const todayISO = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Tồn sau mỗi phiếu (cột “Tồn cuối” của thẻ kho).
function recomputeBalances(moves) {
  const sorted = [...moves].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
  const bal = {}
  for (const m of sorted) {
    bal[m.drugId] = (bal[m.drugId] ?? 0) + m.qty
    m.balance = bal[m.drugId]
  }
  return sorted.reverse()
}

let state = { drugs: [], batches: [], moves: [] }
const listeners = new Set()
function commit(next) {
  state = next
  listeners.forEach((fn) => fn())
}
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getInventory = () => state
export function useInventory() {
  // Chỉ nạp khi có màn cần kho (đã đăng nhập), không nạp lúc khởi động vì chưa có token.
  useEffect(() => {
    if (!liveLoaded) reloadInventory()
  }, [])
  return useSyncExternalStore(subscribe, getInventory)
}

// Server không có API “mọi phiếu kho”: thẻ kho nạp theo từng thuốc khi mở (loadMovesFor).
// Trừ / hoàn kho do server làm khi bác sĩ xác nhận đơn và lễ tân cấp phát.
let liveLoaded = false
let liveLoading = null
const liveName = (d) => [d.trade_name && d.trade_name !== d.generic_name ? d.trade_name : d.generic_name, d.strength].filter(Boolean).join(' ')
const fromServerDrug = (d, cost = 0) => ({
  id: d.drug_id,
  name: liveName(d),
  ingredient: d.generic_name,
  tradeName: d.trade_name,
  strength: d.strength,
  form: d.dosage_form,
  atc: d.active_ingredient_code ?? '',
  drugClass: d.drug_class ?? '',
  unit: d.unit,
  kind: 'drug',
  group: 'regular',
  essential: false,
  cost,
  price: Number(d.sale_price) || 0,
  threshold: d.reorder_level ?? 0,
  use30: 0,
  active: d.is_active
})
const fromServerBatch = (b) => ({
  id: b.batch_id,
  drugId: b.drug_id,
  lot: b.batch_number,
  expiry: b.expiry_date,
  qty: b.remaining_quantity,
  initialQty: b.initial_quantity,
  receivedAt: String(b.created_at).slice(0, 10),
  createdAt: b.created_at,
  cost: Number(b.import_price) || 0
})
async function fetchLive() {
  const drugs = []
  for (let offset = 0; ; offset += 200) {
    const page = await apiGet(`/api/v1/drugs?active_only=false&limit=200&offset=${offset}`)
    drugs.push(...page.items)
    if (drugs.length >= page.total || !page.items.length) break
  }
  const batches = (await apiGet('/api/v1/inventory/batches?include_depleted=true')).map(fromServerBatch)
  // Giá nhập gần nhất của từng thuốc, để gợi ý khi nhập lô mới.
  const lastCost = {}
  for (const b of [...batches].sort((x, y) => x.createdAt.localeCompare(y.createdAt))) lastCost[b.drugId] = b.cost
  return { drugs: drugs.map((d) => fromServerDrug(d, lastCost[d.drug_id] ?? 0)), batches }
}
export function reloadInventory() {
  liveLoading ??= fetchLive()
    .then((x) => {
      liveLoaded = true
      commit({ ...state, ...x })
    })
    .catch(() => {})
    .finally(() => (liveLoading = null))
  return liveLoading
}
const liveError = (e) => (e instanceof ApiError ? (e.details?.[0]?.message ?? e.message) : 'Cannot reach the clinic server. Check the server address and the network connection.')

const MOVE_OF = { Deduct: 'out', Restore: 'return' }
export async function loadMovesFor(drugId) {
  const lots = state.batches.filter((b) => b.drugId === drugId)
  const rows = (await Promise.all(lots.map((b) => apiGet(`/api/v1/inventory/batches/${b.id}/movements`).then((ms) => ms.map((m) => [b, m]))))).flat()
  const moves = [
    ...lots.map((b) => ({ id: 'in-' + b.id, at: b.createdAt, drugId, batchId: b.id, lot: b.lot, type: 'in', qty: b.initialQty, ref: b.lot, by: '', note: '' })),
    ...rows.map(([b, m]) => ({
      id: m.movement_id,
      at: m.created_at,
      drugId,
      batchId: b.id,
      lot: b.lot,
      type: MOVE_OF[m.movement_type] ?? (m.quantity_change >= 0 ? 'in' : 'out'),
      qty: m.quantity_change,
      ref: m.reason_code ?? m.movement_type,
      by: '',
      note: m.note ?? ''
    }))
  ]
  commit({ ...state, moves: recomputeBalances([...state.moves.filter((m) => m.drugId !== drugId), ...moves]) })
}
export const nearDays = () => getSettings().ops.nearDays
export function daysLeft(iso) {
  const t = new Date(todayISO() + 'T00:00:00')
  return Math.round((new Date(iso + 'T00:00:00') - t) / 86400000)
}

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
  // Mức tồn mục tiêu = ngưỡng an toàn + lượng dùng 30 ngày; gợi ý đặt phần còn thiếu (làm tròn lên 10).
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

// data dùng tên trường của server (generic_name, trade_name, strength, …). Trả { ok, id } hoặc { ok: false, error }.
export async function saveDrugLive(id, body) {
  try {
    const r = id ? await apiRequest(`/api/v1/drugs/${id}`, 'PATCH', body) : await apiPost('/api/v1/drugs', body)
    await reloadInventory()
    return { ok: true, id: r.drug_id }
  } catch (e) {
    return { ok: false, error: liveError(e) }
  }
}

export const setDrugActive = (id, active) => saveDrugLive(id, { is_active: active })

// Số lô đã có cho thuốc này → BATCH_EXISTS.
export function receiveStock({ drugId, lot, expiry, qty, cost }) {
  return apiPost('/api/v1/inventory/batches', { drug_id: drugId, batch_number: lot, expiry_date: expiry, quantity: qty, import_price: cost }).then(
    async (b) => (await reloadInventory(), { ok: true, id: b.batch_id }),
    (e) => ({ ok: false, error: liveError(e) })
  )
}

// Lô đủ điều kiện cho một đợt dùng: hạn dùng > hôm nay + max(số ngày dùng, khoảng an toàn ở Cài đặt › Vận hành).
// Lô còn 3 ngày không được cấp cho đợt 7 ngày.
export const shelfBuffer = () => Number(getSettings().ops.shelfBufferDays) || 0
export function eligibleFor(b, days = 0) {
  const need = Math.max(Number(days) || 0, shelfBuffer())
  const left = daysLeft(b.expiry)
  return need > 0 ? left > need : left >= 0
}

// Lý do điều chỉnh tồn trong dữ liệu cũ (chỉ để hiển thị).
const REASONS = { lost: 'Lost', damaged: 'Broken / damaged', expired: 'Expired, not yet disposed', entry: 'Data entry error at receipt', dispense: 'Dispensing error', other: 'Other (explain in note)' }
export const reasonLabel = (k) => REASONS[k] ?? ''
