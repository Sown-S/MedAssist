// Danh mục thuốc + tồn kho từ server. Kê đơn phải dùng drug_id của server nên ô tìm thuốc ở màn khám dùng danh mục này.
import { useEffect, useSyncExternalStore } from 'react'
import { apiGet } from './client'

const V1 = '/api/v1'
let state = { drugs: [], loaded: false, error: null }
const subs = new Set()
const commit = (s) => {
  state = s
  subs.forEach((f) => f())
}

// Tên thương mại + hàm lượng; không có tên thương mại riêng thì dùng tên hoạt chất.
const nameOf = (d) => [d.trade_name && d.trade_name !== d.generic_name ? d.trade_name : d.generic_name, d.strength].filter(Boolean).join(' ')

export function toDrug(d, stock) {
  return {
    id: d.drug_id,
    name: nameOf(d),
    ingredient: d.generic_name,
    tradeName: d.trade_name,
    strength: d.strength,
    form: d.dosage_form,
    unit: d.unit,
    price: Number(d.sale_price) || 0,
    active: d.is_active,
    drugClass: d.drug_class,
    stock: { usable: stock?.usable_quantity ?? 0, nearExpiry: stock?.near_expiry_quantity ?? 0, expired: stock?.expired_quantity ?? 0 }
  }
}

async function fetchAll() {
  const drugs = []
  for (let offset = 0; ; offset += 200) {
    const page = await apiGet(`${V1}/drugs?limit=200&offset=${offset}`)
    drugs.push(...page.items)
    if (drugs.length >= page.total || !page.items.length) break
  }
  const stock = new Map((await apiGet(`${V1}/inventory/stock`)).map((s) => [s.drug_id, s]))
  return drugs.map((d) => toDrug(d, stock.get(d.drug_id)))
}

let loading = null
// Gọi khi mở màn khám và sau khi chốt đơn (tồn thay đổi).
export function reloadServerDrugs() {
  loading ??= fetchAll()
    .then((drugs) => commit({ drugs, loaded: true, error: null }))
    .catch((e) => commit({ ...state, error: e }))
    .finally(() => (loading = null))
  return loading
}

const subscribe = (f) => (subs.add(f), () => subs.delete(f))
export function useServerDrugs({ enabled = true } = {}) {
  const s = useSyncExternalStore(subscribe, () => state)
  useEffect(() => {
    if (enabled && !state.loaded) reloadServerDrugs()
  }, [enabled])
  return s
}

const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
// Dòng thuốc chép từ đơn cũ / đơn mẫu không có drug_id → tìm theo tên.
export const findServerDrug = (name, drugs) => drugs.find((d) => fold(d.name) === fold(name)) ?? null
