// Đơn đã xác nhận theo kỳ (GET /prescriptions) cho màn Đơn thuốc và trang chủ khi chạy với server.
import { useEffect, useState } from 'react'
import { apiGet } from './client'

const V1 = '/api/v1'

export const listPrescriptions = ({ from, to, physicianId } = {}) =>
  apiGet(
    `${V1}/prescriptions?${new URLSearchParams({
      ...(from ? { date_from: from } : {}),
      ...(to ? { date_to: to } : {}),
      ...(physicianId ? { physician_id: physicianId } : {})
    })}`
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
  const [list, setList] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = () =>
      listPrescriptions({ from, to, physicianId }).then(
        (x) => alive && (setList(x.map(fromServerRx)), setError(null), setLoaded(true)),
        (e) => alive && (setError(e), setLoaded(true))
      )
    load()
    const t = setInterval(load, ms)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [from, to, physicianId, enabled, ms])
  return { list, loaded, error }
}
