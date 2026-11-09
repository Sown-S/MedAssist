// Định dạng dùng chung: tiền đồng, ngày, chuỗi bỏ dấu để so khớp tìm kiếm.

const p2 = (n) => String(n).padStart(2, '0')

// Ngày theo giờ máy dạng yyyy-mm-dd (không theo UTC).
export const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

// Số tiền kèm “đ”, số âm có dấu trừ; giá trị không phải số → 0đ.
export function money(n) {
  const v = Number(n) || 0
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('vi-VN') + 'đ'
}

// Ngày giờ ngắn (dd/mm/yyyy hh:mm); thiếu → '—'.
export const shortDateTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—')

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
