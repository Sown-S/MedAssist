// Đơn đã xác nhận theo kỳ (GET /prescriptions) cho màn Đơn thuốc và trang chủ khi chạy với server.
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { queryClient } from '../lib/queryClient'
import { apiGet } from './client'
import { checkShape, listOf } from './validate'
import { PrescriptionListItem } from './schemas.gen'

const V1 = '/api/v1'

const listPrescriptions = async ({ from, to, physicianId } = {}) =>
  checkShape(
    listOf(PrescriptionListItem),
    await apiGet(
      `${V1}/prescriptions?${new URLSearchParams({
        ...(from ? { date_from: from } : {}),
        ...(to ? { date_to: to } : {}),
        ...(physicianId ? { physician_id: physicianId } : {})
      })}`
    ),
    'GET /prescriptions'
  )

// Dạng dòng mà màn Đơn thuốc dùng; pay theo PAY_STATUS (paid / unpaid).
export const fromServerRx = (r) => ({
  id: r.prescription_id,
  visitId: r.visit_id,
  ticket: r.queue_number,
  patientId: r.patient_code,
  name: r.patient_name,
  doctor: r.physician_name,
  doctorId: r.physician_id,
  at: r.confirmed_at,
  status: r.status,
  rx: r.items.map((x) => ({ name: x.drug_name, qty: x.quantity, unit: x.unit, usage: `${x.dosage} — ${x.frequency} — ${x.duration_days} ngày`, dispense: x.dispense_status })),
  amount: Number(r.invoice_total ?? r.drug_total) || 0,
  pay: r.invoice_status === 'Paid' ? 'paid' : 'unpaid'
})

// Hỏi lại định kỳ như hàng đợi; enabled = false thì không gọi.
export function usePrescriptions({ from, to, physicianId, enabled = true, ms = 15000 }) {
  const q = useQuery(
    {
      queryKey: ['prescriptions', { from, to, physicianId }],
      queryFn: () => listPrescriptions({ from, to, physicianId }).then((x) => x.map(fromServerRx)),
      enabled,
      refetchInterval: ms,
      placeholderData: keepPreviousData
    },
    queryClient
  )
  return {
    list: q.data ?? [],
    loaded: q.isFetched || q.isError,
    error: q.error ?? null
  }
}
