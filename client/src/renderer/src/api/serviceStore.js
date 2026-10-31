// Dịch vụ, xét nghiệm, gói khám và phiếu chỉ định khi chạy với server (ERD v2.1). Phiếu server được đổi sang dạng
// phiếu client để printLabOrder, labRows, LabOrderResults dùng chung cho hai chế độ.
import { useCallback, useEffect, useState } from 'react'
import { DEMO_MODE, ApiError } from './client'
import { fetchServices, fetchPackages, fetchServiceOrders } from './serviceApi'

const refText = (x) =>
  x.ref_text || (x.ref_low != null || x.ref_high != null ? `${x.ref_low ?? ''}–${x.ref_high ?? ''}${x.unit ? ' ' + x.unit : ''}` : '')

// Giữ item_id làm code để khoá kết quả "<order_id>:<item_id>" khớp labRows.
// Dịch vụ khám trong gói (group_key "consult") không có kết quả → không đưa vào danh sách xét nghiệm.
export const toLabOrder = (o) => ({
  id: o.order_id,
  at: o.ordered_at,
  by: o.ordered_by_name ?? '',
  diagnosis: o.diagnosis ?? '',
  note: o.note ?? '',
  conclusion: o.conclusion ?? '',
  packageName: o.package_name ?? '',
  other: '',
  tests: o.items.filter((x) => x.group_key !== 'consult').map((x) => ({
    code: x.item_id,
    itemId: x.item_id,
    name: x.item_name,
    sample: x.sample ?? '',
    result: x.result ?? '',
    cancelled: x.status === 'Cancelled',
    inPackage: x.in_package,
    ref: refText(x)
  }))
})

export const apiMessage = (e) =>
  e instanceof ApiError ? e.details?.[0]?.message ?? e.message : 'Cannot reach the clinic server. Check the server address and the network connection.'

// visitId = null → không nạp (bản demo).
export function useServiceOrders(visitId) {
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')
  const reload = useCallback(() => {
    if (!visitId || DEMO_MODE) return Promise.resolve()
    return fetchServiceOrders(visitId).then(
      (list) => {
        setOrders(list.map(toLabOrder))
        setError('')
      },
      (e) => setError(apiMessage(e))
    )
  }, [visitId])
  useEffect(() => {
    reload()
  }, [reload])
  return { orders: orders ?? [], loaded: orders !== null, error, reload, setOrders }
}

export function useServiceCatalog({ enabled = !DEMO_MODE } = {}) {
  const [data, setData] = useState({ services: [], packages: [], loaded: false, error: '' })
  const reload = useCallback(() => {
    if (!enabled) return Promise.resolve()
    return Promise.all([fetchServices(), fetchPackages()]).then(
      ([services, packages]) => setData({ services, packages, loaded: true, error: '' }),
      (e) => setData((d) => ({ ...d, loaded: true, error: apiMessage(e) }))
    )
  }, [enabled])
  useEffect(() => {
    reload()
  }, [reload])
  return { ...data, reload }
}

// Chỉ định được: mọi xét nghiệm và dịch vụ không phải khám bệnh (siêu âm, điện tim, thủ thuật…).
export const orderable = (services) => services.filter((s) => s.is_active !== false && (s.kind === 'Lab' || s.group_key !== 'consult'))
