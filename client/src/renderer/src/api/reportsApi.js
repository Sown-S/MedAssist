// Báo cáo vận hành cho Admin: GET /api/v1/reports/summary?date_from&date_to (server/app/routers — Sơn).
// Server trả SỐ THÔ, client tự định dạng tiền và phần trăm:
//   visits:  { total, by_status: { Waiting, CheckedIn, Examining, Prescribed, Finished, Cancelled }, red_flags }
//   revenue: { invoices_paid, total, consultation, paraclinical, drug, by_day: [{ date, total }] } — theo ngày thu tiền
//   ai:      { assessments: { total, full, rule_only, failed, skipped, pending, avg_latency_ms },
//              decisions: { accepted_top, chose_other, no_suggestion, acceptance_rate (0–1, null khi chưa có ca) },
//              extractions: { total, completed, failed } }
// Không có Precision / Recall / F1: phòng khám không có nhãn đúng — các chỉ số đó đo trên testset v1.0 (evaluation/).
// Chỉ số tổng hợp, không có dữ liệu bệnh nhân → Admin xem được.
import { apiGet } from './client'

const p2 = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

export const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' }
]

// Khoảng ngày [từ, đến] theo giờ máy. 'week' bắt đầu từ thứ Hai; '7d' = 7 ngày gần nhất (biểu đồ trang chủ).
export function rangeOf(period) {
  const now = new Date()
  const from = new Date(now)
  if (period === 'week') from.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  else if (period === 'month') from.setDate(1)
  else if (period === '7d') from.setDate(now.getDate() - 6)
  return [ymd(from), ymd(now)]
}

export const reportPath = ([from, to]) => `/api/v1/reports/summary?date_from=${from}&date_to=${to}`

// Nhật ký AI (Admin): GET /api/v1/admin/ai-logs — mới nhất trước, trả { total, limit, offset, items }.
// Mỗi dòng chỉ có metadata (trạng thái, mode, mức ưu tiên, mã bệnh gợi ý, model, độ trễ, quyết định của bác sĩ);
// không có bệnh nhân, triệu chứng hay đầu ra thô của LLM. filters: { from, to, run_type, status, mode } (rỗng = bỏ qua).
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

// Doanh thu từng ngày trong khoảng, ngày không có hóa đơn đã thu = 0 (server chỉ trả ngày có tiền).
export function fillDays(byDay = [], [from, to]) {
  const amt = Object.fromEntries(byDay.map((d) => [d.date, Number(d.total) || 0]))
  const out = []
  for (const d = new Date(from + 'T12:00:00'); ymd(d) <= to; d.setDate(d.getDate() + 1)) {
    out.push({ day: `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`, amt: amt[ymd(d)] ?? 0 })
  }
  return out
}
