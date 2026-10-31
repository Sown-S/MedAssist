// Danh mục Dịch vụ, Xét nghiệm, Gói khám khi chạy với server (ERD v2.1), đổi về hình dạng dòng của catalogStore
// để CatalogDetailPage dùng chung bảng và form với bản demo. Mã và loại dịch vụ không đổi được sau khi tạo.
import { useEffect, useSyncExternalStore } from 'react'
import { DEMO_MODE } from './client'
import { fetchServices, fetchPackages, createService, updateService, createPackage, updatePackage, fetchPriceHistory } from './serviceApi'
import { apiMessage } from './serviceStore'

export const LIVE_CATALOGS = ['services', 'labs', 'packages']
export const isLiveCatalog = (key) => !DEMO_MODE && LIVE_CATALOGS.includes(key)

const num = (x) => (x == null ? null : Number(x))
const fromService = (s) => ({
  id: s.service_id,
  code: s.code,
  name: s.name,
  group: s.group_key,
  unit: s.unit ?? '',
  price: Number(s.price) || 0,
  low: num(s.ref_low),
  high: num(s.ref_high),
  refText: s.ref_text ?? '',
  sample: s.sample ?? '',
  active: s.is_active,
  updatedAt: s.updated_at,
  updatedBy: ''
})
const fromPackage = (p) => ({
  id: p.package_id,
  code: p.code,
  name: p.name,
  price: Number(p.price) || 0,
  items: p.items.map((x) => ({ ref: (x.kind === 'Lab' ? 'lab:' : 'service:') + x.code, qty: x.quantity })),
  active: p.is_active,
  updatedAt: p.updated_at,
  updatedBy: ''
})

let state = { services: [], labs: [], packages: [], loaded: false, error: '' }
const listeners = new Set()
const commit = (next) => {
  state = next
  listeners.forEach((fn) => fn())
}
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
let loading = null
export function reloadLiveCatalog() {
  loading ??= Promise.all([fetchServices({ includeInactive: true }), fetchPackages(true)])
    .then(
      ([svc, pk]) =>
        commit({
          services: svc.filter((s) => s.kind === 'Service').map(fromService),
          labs: svc.filter((s) => s.kind === 'Lab').map(fromService),
          packages: pk.map(fromPackage),
          loaded: true,
          error: ''
        }),
      (e) => commit({ ...state, loaded: true, error: apiMessage(e) })
    )
    .finally(() => (loading = null))
  return loading
}
export function useLiveCatalog(enabled) {
  useEffect(() => {
    if (enabled) reloadLiveCatalog()
  }, [enabled])
  return useSyncExternalStore(subscribe, () => state)
}

// Không gửi code, kind khi sửa — server không cho đổi.
const bodyOf = (key, d) => ({
  name: d.name,
  group_key: d.group,
  unit: d.unit || null,
  price: d.price ?? 0,
  ...(key === 'labs' ? { ref_low: d.low, ref_high: d.high, ref_text: d.refText || null, sample: d.sample || null } : {})
})
const idOfRef = (ref) => {
  const [kind, code] = String(ref).split(':')
  return (kind === 'lab' ? state.labs : state.services).find((r) => r.code === code)?.id
}

export async function saveLiveRow(key, d) {
  try {
    if (key === 'packages') {
      const items = (d.items ?? []).map((it) => ({ service_id: idOfRef(it.ref), quantity: Number(it.qty) || 1 }))
      if (items.some((x) => !x.service_id)) return { ok: false, error: 'A service in this package is not in the catalog.' }
      if (d.id) await updatePackage(d.id, { name: d.name, price: d.price ?? 0, items })
      else await createPackage({ code: d.code, name: d.name, price: d.price ?? 0, items })
    } else if (d.id) await updateService(d.id, bodyOf(key, d))
    else await createService({ code: d.code, kind: key === 'labs' ? 'Lab' : 'Service', ...bodyOf(key, d) })
    await reloadLiveCatalog()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: apiMessage(e) }
  }
}

export async function setLiveActive(key, id, active) {
  try {
    if (key === 'packages') await updatePackage(id, { is_active: active })
    else await updateService(id, { is_active: active })
    await reloadLiveCatalog()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: apiMessage(e) }
  }
}

// Lấy từ nhật ký server, mới nhất trước.
export const livePriceHistory = (id) => fetchPriceHistory(id)
