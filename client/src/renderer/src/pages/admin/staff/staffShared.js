// Dùng chung cho màn Tài khoản nhân viên: form trống, lọc theo trạng thái, tài khoản bỏ không.
export const EMPTY = { fullName: '', username: '', roleKey: 'doctor', phone: '', staffCode: '', roomId: null, licenseNo: '' }
// Không đăng nhập quá số ngày này → coi là tài khoản bỏ không, nên xem xét vô hiệu hoá.
export const IDLE_DAYS = 30

export const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null)
export const isIdle = (a) => a.active && (a.lastLoginAt ? daysSince(a.lastLoginAt) >= IDLE_DAYS : daysSince(a.createdAt) >= IDLE_DAYS)

export const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Password change pending' },
  { key: 'locked', label: 'Locked' },
  { key: 'idle', label: 'Unused' },
  { key: 'disabled', label: 'Disabled' }
]
export function matchStatus(a, f) {
  if (f === 'active') return a.active && !a.locked
  if (f === 'pending') return a.mustChange
  if (f === 'locked') return a.locked
  if (f === 'idle') return isIdle(a)
  if (f === 'disabled') return !a.active
  return true
}

// Nhãn tiếng Anh, dịch khi hiển thị nhật ký.
export const FIELD_LABELS = { fullName: 'Full name', staffCode: 'Staff code', phone: 'Phone', roomId: 'Consultation room', licenseNo: 'Practising licence no.' }
