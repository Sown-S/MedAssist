import { useEffect, useState } from 'react'
import { PAYMENT_METHODS } from '../../api/settingsStore'

export const fmt = (n) => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('vi-VN') + 'đ'
export const hhmm = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
export const dmy = (iso) => new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
// Hoá đơn pending chưa chọn hình thức (method = null) → '—'.
export const methodLabel = (k) => (k ? PAYMENT_METHODS.find((m) => m.key === k)?.label ?? k : '—')

// Trạng thái thanh toán: nhãn + màu huy hiệu.
export const PAY_STATUS = {
  unpaid: { label: 'Not paid', cls: 'low' },
  pending: { label: 'Awaiting payment', cls: 'warn' },
  processing: { label: 'Waiting for transfer', cls: 'warn' },
  paid: { label: 'Paid', cls: 'ok' },
  cancelled: { label: 'Cancelled', cls: 'muted' }
}

// Cập nhật "đã chờ bao nhiêu phút" mỗi 30 giây.
export function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  return now
}

// ---------- Lọc theo kỳ (Hôm nay / Tuần này / Tháng này / Tất cả / Chọn ngày) ----------
const p2 = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
export const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
  { key: 'date', label: 'Pick a date' }
]
// Khoảng ngày [từ, đến] (YYYY-MM-DD, theo giờ máy). Tuần bắt đầu từ thứ Hai.
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
export const inRange = (day, [from, to]) => day >= from && day <= to
export const periodLabel = (period, date) => (period === 'date' ? dmy((date || ymd(new Date())) + 'T00:00:00') : PERIODS.find((p) => p.key === period)?.label ?? '')
