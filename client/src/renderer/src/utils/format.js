// Định dạng dùng chung: tiền đồng, số, ngày giờ, chuỗi bỏ dấu để so khớp tìm kiếm.
// Màn hình dùng các hàm ở đây thay vì tự gọi toLocaleString, để cùng một loại dữ liệu hiện giống nhau mọi nơi.

const p2 = (n) => String(n).padStart(2, '0')

// ---- Ngày giờ ----

// Ngày theo giờ máy dạng yyyy-mm-dd (không theo UTC). Không truyền → hôm nay.
export const ymd = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

// Hôm nay theo giờ Việt Nam (yyyy-mm-dd), dù máy đặt múi giờ khác: khớp ngày làm việc của máy chủ.
export const todayVN = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })

// Giờ:phút 24h (14:05). tz: múi giờ IANA, bỏ trống = giờ máy.
export const hhmm = (when, tz) => new Date(when).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })

// Ngày dd/mm/yyyy từ mốc thời gian (ISO có giờ, Date, số ms).
export const dmy = (when) => new Date(when).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

// Ngày dd/mm/yyyy từ chuỗi ngày 'yyyy-mm-dd…' (cắt chuỗi, không đổi múi giờ); thiếu → '—'.
export function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = String(s).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Ngày giờ dd/mm/yyyy hh:mm theo giờ máy (seconds: thêm :ss, dùng cho nhật ký); thiếu → '—'.
export function fmtDateTime(when, { seconds = false } = {}) {
  if (!when) return '—'
  const d = new Date(when)
  const t = `${p2(d.getHours())}:${p2(d.getMinutes())}` + (seconds ? ':' + p2(d.getSeconds()) : '')
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${t}`
}

// ---- Số và tiền ----

// Số có dấu chấm ngăn hàng nghìn (1.250); không phải số → '—'.
export const fmtNum = (n) => (Number.isFinite(n) ? n.toLocaleString('vi-VN') : '—')

// Số tiền kèm “ đ”, số âm có dấu trừ; giá trị không phải số → 0 đ.
export function money(n) {
  const v = Number(n) || 0
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('vi-VN') + ' đ'
}

// Như money nhưng làm tròn và hiện '—' khi chưa có giá (không phải số) thay vì 0 đ.
export const fmtMoney = (n) => (Number.isFinite(n) ? money(Math.round(n)) : '—')

// Tiền gọn liền chữ “đ” (1.250đ), làm tròn: dùng trong biểu đồ, báo cáo, gợi ý chọn thuốc.
export const vnd = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ'

// ---- Chuỗi ----

// Bỏ dấu tiếng Việt, viết thường, gộp khoảng trắng để tìm “nguyen” ra “Nguyễn”.
export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
