// Lời gọi API cấp phát thuốc và thu tiền ở quầy (chỉ dùng khi tắt giả lập).
// Server: server/app/routers/billing_router.py — Nurse thao tác; kho đã trừ lúc bác sĩ xác nhận đơn.
//  - "Đã cấp" chỉ ghi nhận; "Bỏ qua" (bắt buộc lý do) hoàn kho + lập lại hóa đơn Pending.
//  - Sửa hóa đơn Pending (phí khám, dòng cận lâm sàng nhập tay) = hủy và lập lại (mã mới).
//  - Thu tiền: Pending -> Paid (Tiền mặt / Chuyển khoản). Đã thu tiền VÀ cấp phát xong -> lượt khám Finished.
import { useEffect, useState } from 'react'
import { apiGet, apiPost, apiRequest, ApiError } from './client'

const V1 = '/api/v1'

export const getAwaiting = () => apiGet(`${V1}/billing/awaiting`)
// Lịch sử hóa đơn của một ngày (yyyy-mm-dd, bỏ trống = hôm nay), có patient_name, queue_number.
// Hóa đơn bị hủy do sửa (lập lại mã mới) chỉ trả khi includeCancelled.
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
// consultation_fee / paraclinical_items: bỏ trống (undefined) = giữ nguyên.
export const editInvoice = (visitId, body) => apiRequest(`${V1}/visits/${visitId}/invoice`, 'PATCH', body)
export const payInvoice = (visitId, method) => apiPost(`${V1}/visits/${visitId}/invoice/pay`, { payment_method: method })
export const dispenseItem = (itemId, action, skipReason) =>
  apiRequest(`${V1}/prescription-items/${itemId}/dispense`, 'PATCH', { action, ...(action === 'Skipped' ? { skip_reason: skipReason } : {}) })
export const dispenseAll = (visitId) => apiPost(`${V1}/visits/${visitId}/dispense-all`, {})

// Phương thức thanh toán: client 'cash' | 'transfer' ↔ server 'Cash' | 'BankingTransfer'.
export const toServerMethod = (m) => (m === 'transfer' ? 'BankingTransfer' : 'Cash')
export const fromServerMethod = (m) => (m === 'BankingTransfer' ? 'transfer' : 'cash')

// Hóa đơn server → hình dạng printReceipt (components/queuePrint.js) đang dùng.
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

// Một dòng GET /billing/awaiting → dạng lượt khám mà PaymentModal và các danh sách ở quầy dùng.
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

// Danh sách chờ cấp phát / thu tiền (lượt Prescribed, cũ nhất trước) — hỏi lại định kỳ như hàng đợi.
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
