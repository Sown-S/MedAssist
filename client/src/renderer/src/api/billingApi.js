// Cấp phát thuốc và thu tiền ở quầy (billing_router). Kho đã trừ lúc bác sĩ xác nhận đơn: “Đã cấp” chỉ ghi nhận,
// “Bỏ qua” hoàn kho và lập lại hoá đơn; sửa hoá đơn Pending = huỷ và lập lại mã mới.
// Đã thu tiền và cấp phát xong thì lượt khám chuyển Finished.
import { useQuery } from '@tanstack/react-query'
import { queryClient } from '../lib/queryClient'
import { apiGet, apiPost, apiRequest, ApiError } from './client'
import { checkShape, listOf } from './validate'
import { AwaitingPaymentItem, InvoiceHistoryItem } from './schemas.gen'

const V1 = '/api/v1'

const getAwaiting = async () => checkShape(listOf(AwaitingPaymentItem), await apiGet(`${V1}/billing/awaiting`), 'GET /billing/awaiting')
// Hoá đơn của một ngày (bỏ trống = hôm nay). Hoá đơn bị huỷ do sửa chỉ trả khi includeCancelled.
export const listInvoices = async (date, includeCancelled = false) =>
  checkShape(
    listOf(InvoiceHistoryItem),
    await apiGet(`${V1}/billing/invoices?${new URLSearchParams({ ...(date ? { date } : {}), include_cancelled: includeCancelled })}`),
    'GET /billing/invoices'
  )
export async function getInvoice(visitId) {
  try {
    return await apiGet(`${V1}/visits/${visitId}/invoice`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}
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
  const q = useQuery(
    {
      queryKey: ['billing', 'awaiting'],
      queryFn: getAwaiting,
      enabled,
      refetchInterval: ms
    },
    queryClient
  )
  return {
    list: q.data ?? [],
    loaded: q.isFetched || q.isError,
    error: q.error ?? null,
    reload: () => q.refetch()
  }
}

// Hoá đơn hôm nay (không gồm hoá đơn huỷ) cho thẻ tổng quan của Lễ tân.
// null = chưa tải xong lần đầu.
export function useTodayInvoices({ enabled = true, ms = 10000 } = {}) {
  const q = useQuery(
    {
      queryKey: ['billing', 'invoices', 'today'],
      queryFn: () => listInvoices(),
      enabled,
      refetchInterval: ms
    },
    queryClient
  )
  return q.data ?? null
}
