// Cấp phát thuốc và thu tiền ở quầy (billing_router). Kho đã trừ lúc bác sĩ xác nhận đơn: “Đã cấp” chỉ ghi nhận,
// “Bỏ qua” hoàn kho và lập lại hoá đơn; sửa hoá đơn Pending = huỷ và lập lại mã mới.
// Đã thu tiền và cấp phát xong thì lượt khám chuyển Finished.
import { useEffect, useState } from 'react'
import { apiGet, apiPost, apiRequest, ApiError } from './client'

const V1 = '/api/v1'

export const getAwaiting = () => apiGet(`${V1}/billing/awaiting`)
// Hoá đơn của một ngày (bỏ trống = hôm nay). Hoá đơn bị huỷ do sửa chỉ trả khi includeCancelled.
export const listInvoices = (date, includeCancelled = false) =>
  apiGet(`${V1}/billing/invoices?${new URLSearchParams({ ...(date ? { date } : {}), include_cancelled: includeCancelled })}`)
export async function getInvoice(visitId) {
  try {
    return await apiGet(`${V1}/visits/${visitId}/invoice`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}
export const getPrintData = (visitId) => apiGet(`${V1}/visits/${visitId}/invoice/print`)
// consultation_fee / paraclinical_items bỏ trống = giữ nguyên.
export const editInvoice = (visitId, body) => apiRequest(`${V1}/visits/${visitId}/invoice`, 'PATCH', body)
export const payInvoice = (visitId, method) => apiPost(`${V1}/visits/${visitId}/invoice/pay`, { payment_method: method })
export const dispenseItem = (itemId, action, skipReason) =>
  apiRequest(`${V1}/prescription-items/${itemId}/dispense`, 'PATCH', { action, ...(action === 'Skipped' ? { skip_reason: skipReason } : {}) })
export const dispenseAll = (visitId) => apiPost(`${V1}/visits/${visitId}/dispense-all`, {})

export const toServerMethod = (m) => (m === 'transfer' ? 'BankingTransfer' : 'Cash')
export const fromServerMethod = (m) => (m === 'BankingTransfer' ? 'transfer' : 'cash')

export function receiptOf(inv, { name, ticket, byName }) {
  return {
    id: inv.invoice_code,
    name,
    ticket,
    byName,
    method: fromServerMethod(inv.payment_method),
    ref: '',
    createdAt: inv.created_at,
    paidAt: inv.paid_at,
    total: Number(inv.total_amount),
    items: inv.items.map((x) => ({ name: x.item_name, qty: x.quantity, amount: Number(x.subtotal) }))
  }
}

export const fromAwaiting = (a) => ({
  id: a.visit_id,
  ticket: a.queue_number,
  name: a.patient_name,
  doctor: '',
  invoiceCode: a.invoice_code,
  payStatus: a.payment_status,
  hasRx: a.has_prescription,
  total: Number(a.total_amount) || 0,
  pending: a.pending_items
})

// Lượt chờ cấp phát / thu tiền, cũ nhất trước; hỏi lại định kỳ như hàng đợi.
export function useAwaiting({ enabled = true, ms = 4000 } = {}) {
  const [list, setList] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = () =>
      getAwaiting().then(
        (x) => alive && (setList(x), setError(null), setLoaded(true)),
        (e) => alive && (setError(e), setLoaded(true))
      )
    load()
    const t = setInterval(load, ms)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [enabled, ms, tick])
  return { list, loaded, error, reload: () => setTick((n) => n + 1) }
}
