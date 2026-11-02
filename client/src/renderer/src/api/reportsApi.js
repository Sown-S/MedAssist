// Báo cáo vận hành (GET /reports/summary). Server trả số thô, client tự định dạng tiền và phần trăm.
// Không có Precision / Recall: phòng khám không có nhãn đúng — các chỉ số đó đo trên bộ test trong evaluation/.
// Chỉ số tổng hợp, không có dữ liệu bệnh nhân nên Admin xem được.
import { apiGet } from './client'

const p2 = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

export const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' }
]

// Khoảng [từ, đến] theo giờ máy. 'week' bắt đầu từ thứ Hai; '7d' = 7 ngày gần nhất.
export function rangeOf(period) {
  const now = new Date()
  const from = new Date(now)
  if (period === 'week') from.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  else if (period === 'month') from.setDate(1)
  else if (period === '7d') from.setDate(now.getDate() - 6)
  return [ymd(from), ymd(now)]
}

export const reportPath = ([from, to]) => `/api/v1/reports/summary?date_from=${from}&date_to=${to}`

// Nhật ký AI (GET /admin/ai-logs): chỉ có metadata, không có bệnh nhân, triệu chứng hay đầu ra thô của LLM.
export const AI_RUN_TYPES = ['Assessment', 'Extraction']
export const AI_STATUSES = ['Queued', 'Running', 'Completed', 'Degraded', 'Failed', 'Skipped']
export const AI_MODES = ['Full', 'RuleOnly']
export function listAiLogs(filters, limit, offset) {
  const p = new URLSearchParams({ limit, offset })
  if (filters.from) p.set('date_from', filters.from)
  if (filters.to) p.set('date_to', filters.to)
  for (const k of ['run_type', 'status', 'mode']) if (filters[k]) p.set(k, filters[k])
  return apiGet(`/api/v1/admin/ai-logs?${p}`)
}

export const vnd = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ'
export const percent = (rate) => (rate == null ? '—' : Math.round(rate * 100) + '%')

// Server chỉ trả ngày có tiền → điền 0 cho ngày trống.
export function fillDays(byDay = [], [from, to]) {
  const amt = Object.fromEntries(byDay.map((d) => [d.date, Number(d.total) || 0]))
  const out = []
  for (const d = new Date(from + 'T12:00:00'); ymd(d) <= to; d.setDate(d.getDate() + 1)) {
    out.push({ day: `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`, amt: amt[ymd(d)] ?? 0 })
  }
  return out
}
