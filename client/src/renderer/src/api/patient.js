// Tiện ích dùng chung cho dữ liệu bệnh nhân: tính tuổi từ ngày sinh dd/mm/yyyy, điều kiện hỏi mang thai.
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

// Hỏi tình trạng mang thai: nữ hoặc giới tính khác, 12–55 tuổi (server từ chối "đang mang thai" ngoài điều kiện này).
export const askPregnancy = (gender, age) => (gender === 'Female' || gender === 'Other') && age !== '' && age >= 12 && age <= 55
// Nhãn tình trạng mang thai của lượt khám ('yes' | 'no' | '') — hiện đủ 3 trạng thái để bác sĩ biết khi nào cần hỏi lại.
export const PREGNANCY_LABEL = { yes: 'Pregnant', no: 'Not pregnant', '': 'Pregnancy not asked' }
