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
const REPORT_SUMMARY = {
  stats: { visits: 18, revenue: '3.500.000đ', redFlags: 2, aiMatch: '83%' },
  revenue: [
    { label: 'Consultation', pct: 42, amt: '1.470.000đ' },
    { label: 'Medication', pct: 58, amt: '2.030.000đ', color: 'var(--priority)' }
  ],
  aiPerf: [
    { label: 'Precision', pct: 81, num: '0.81' },
    { label: 'Recall', pct: 77, num: '0.77' },
    { label: 'F1-score', pct: 79, num: '0.79' }
  ]
}

// Bác sĩ: hàng đợi / đơn thuốc dùng queueStore + rxHistory. Cận lâm sàng: phiếu chỉ định in giấy (LabOrderModal).
// Quản trị: Hồ sơ bệnh nhân / Hoá đơn đọc patientStore + invoiceStore.
// ===== Quản trị — trang chủ =====
const ADMIN_DASHBOARD = {
  // Trạng thái hệ thống: xem checkHealth() trong api/client.js (GET /health).
  ai: { unconfirmed: 3 },
  revenue7d: [
    { day: '03/08', amt: 2800000 },
    { day: '04/08', amt: 3100000 },
    { day: '05/08', amt: 2400000 },
    { day: '06/08', amt: 3900000 },
    { day: '07/08', amt: 3300000 },
    { day: '08/08', amt: 1900000 },
    { day: '09/08', amt: 3500000 }
  ],
  stats: { staff: 12, aiRules: 85, lowStock: 4, status: 'Online' },
  activity: [
    { time: '08:12:04', user: 'Nguyễn Thị Mai', action: 'Created new record #00000143' },
    { time: '09:15:30', user: 'Nguyễn Văn Dũng', action: 'Edited record #123' },
    { time: '09:18:02', user: 'Trần Minh', action: 'Finalized prescription #451' },
    { time: '09:42:33', user: 'Trần Thị Lan', action: 'Stock adjustment — Amoxicillin 500mg' }
  ]
}

// Phân quyền vai trò: xem api/permissionStore.js (3 vai trò cố định, có lưu & nhật ký).

// "path" ở đây được đặt tên theo đúng quy ước REST mà Sơn nhiều khả năng sẽ dùng bên FastAPI
// (GET /schedule/slots, GET /reports/summary...).
// Các trang gọi apiGet('/reports/summary') — không cần biết là mock hay thật.
export const MOCK_ENDPOINTS = {
  '/schedule/days': () => SCHEDULE_DAYS,
  '/schedule/slots': () => SCHEDULE_SLOTS,
  '/reports/summary': () => REPORT_SUMMARY,

  '/admin/dashboard': () => ADMIN_DASHBOARD
}
