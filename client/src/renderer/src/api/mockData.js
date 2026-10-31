// Dữ liệu mẫu cho các endpoint đọc của bản demo (apiGet trả về khi giả lập).


const SCHEDULE_DAYS = ['Tue · 28/08', 'Wed · 29/08', 'Thu · 30/08', 'Fri · 31/08']
const SCHEDULE_SLOTS = [
  { time: '08:00', name: 'Đặng Thị Kim', note: 'General check-up · Checked in', late: false },
  { time: '08:30', name: 'Nguyễn Phương Anh (child)', note: 'Pediatric follow-up · Awaiting confirmation', late: false },
  { time: '09:30', name: 'Nguyễn Văn Hùng', note: 'General check-up · Awaiting confirmation', late: false },
  { time: '10:00', name: 'Nguyễn Thị Mai', note: 'Follow-up · Awaiting confirmation', late: false },
  { time: '10:15', name: 'Hồ Thu Ngành', note: '12 minutes late', late: true },
  { time: '11:00', name: 'Lê Văn Nam', note: 'General check-up · Awaiting confirmation', late: false },
  { time: '14:30', name: 'Lê Quốc Bảo', note: 'Gastric follow-up · Awaiting confirmation', late: false }
]


// Cùng định dạng với GET /reports/summary; giả lập không lọc theo ngày.
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const REPORT_SUMMARY = () => ({
  visits: { total: 18, by_status: { Waiting: 3, CheckedIn: 2, Examining: 1, Prescribed: 2, Finished: 9, Cancelled: 1 }, red_flags: 2 },
  revenue: {
    invoices_paid: 9,
    total: 3500000,
    consultation: 1350000,
    paraclinical: 150000,
    drug: 2000000,
    by_day: [2800000, 3100000, 2400000, 3900000, 3300000, 1900000, 3500000].map((total, i) => ({ date: daysAgo(6 - i), total }))
  },
  ai: {
    assessments: { total: 16, full: 12, rule_only: 2, failed: 0, skipped: 2, pending: 0, avg_latency_ms: 41250 },
    decisions: { accepted_top: 10, chose_other: 2, no_suggestion: 2, acceptance_rate: 10 / 12 },
    extractions: { total: 8, completed: 7, failed: 1 }
  }
})


// Giả lập bỏ qua phần ?query của đường dẫn.
export const MOCK_ENDPOINTS = {
  '/schedule/days': () => SCHEDULE_DAYS,
  '/schedule/slots': () => SCHEDULE_SLOTS,
  '/api/v1/reports/summary': REPORT_SUMMARY
}
