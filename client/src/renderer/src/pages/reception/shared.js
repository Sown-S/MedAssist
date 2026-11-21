import { useEffect, useState } from 'react'
import { PAYMENT_METHODS } from '../../api/settingsStore'
import { ymd, dmy } from '../../utils/format'

// Hoá đơn pending chưa chọn hình thức → '—'.
export const methodLabel = (k) => (k ? PAYMENT_METHODS.find((m) => m.key === k)?.label ?? k : '—')

export const PAY_STATUS = {
  unpaid: { label: 'Not paid', cls: 'b-warning' },
  pending: { label: 'Awaiting payment', cls: 'b-warning' },
  processing: { label: 'Waiting for transfer', cls: 'b-info' },
  paid: { label: 'Paid', cls: '' },
  cancelled: { label: 'Cancelled', cls: 'b-neutral' }
}

export function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  return now
}

export const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
  { key: 'date', label: 'Pick a date' }
]
// Theo giờ máy; tuần bắt đầu từ thứ Hai.
export function periodRange(period, date) {
  const now = new Date()
  const today = ymd(now)
  if (period === 'today') return [today, today]
  if (period === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return [ymd(d), today]
  }
  if (period === 'month') return [today.slice(0, 8) + '01', today]
  if (period === 'date') return [date || today, date || today]
  return ['0000-00-00', '9999-99-99']
}
export const periodLabel = (period, date) => (period === 'date' ? dmy((date || ymd(new Date())) + 'T00:00:00') : PERIODS.find((p) => p.key === period)?.label ?? '')
