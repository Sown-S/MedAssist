// Tiện ích dùng chung cho dữ liệu bệnh nhân: so khớp không dấu và tính tuổi từ ngày sinh dd/mm/yyyy.
export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

export function ageOf(dob) {
  const m = String(dob ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return ''
  // Ngày phải có thật trên lịch (31/02, tháng 13… là gõ nhầm).
  const real = new Date(+m[3], +m[2] - 1, +m[1])
  if (real.getFullYear() !== +m[3] || real.getMonth() !== +m[2] - 1 || real.getDate() !== +m[1]) return ''
  const now = new Date()
  let age = now.getFullYear() - +m[3]
  if (now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[1])) age--
  return age >= 0 && age < 130 ? age : ''
}
