// Toàn bộ dữ liệu giả trước đây nằm rải rác trong Reception.jsx / Doctor.jsx / các trang admin
// giờ gom về 1 chỗ. Khi ghép API thật, các hằng số này bị xoá dần — nhưng CẤU TRÚC dữ liệu
// (tên field: id, name, meta, time, priority, details...) nên giữ nguyên để phía backend
// biết chính xác cần trả JSON hình dạng gì cho từng trang.

// Hàng chờ tiếp đón: xem api/queueStore.js (giờ đến tính lùi từ thời điểm mở app).

// ===== Lịch hẹn (Schedule) =====
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


// ===== Báo cáo (Reports) =====
// Cùng định dạng số thô với GET /api/v1/reports/summary (xem api/reportsApi.js). Giả lập không lọc theo ngày.
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

// Bác sĩ: hàng đợi / đơn thuốc dùng queueStore + rxHistory. Cận lâm sàng: phiếu chỉ định in giấy (LabOrderModal).
// Quản trị: Hồ sơ bệnh nhân / Hoá đơn đọc patientStore + invoiceStore.
// Phân quyền vai trò: xem api/permissionStore.js (3 vai trò cố định, có lưu & nhật ký).

// "path" ở đây được đặt tên theo đúng quy ước REST mà Sơn nhiều khả năng sẽ dùng bên FastAPI
// (GET /schedule/slots, GET /reports/summary...).
// Các trang gọi apiGet('/api/v1/reports/summary?...') — không cần biết là mock hay thật (giả lập bỏ qua phần ?query).
export const MOCK_ENDPOINTS = {
  '/schedule/days': () => SCHEDULE_DAYS,
  '/schedule/slots': () => SCHEDULE_SLOTS,
  '/api/v1/reports/summary': REPORT_SUMMARY
}
