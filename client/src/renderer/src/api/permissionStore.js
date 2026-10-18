// QUYỀN THEO VAI TRÒ — cố định, không chỉnh trên giao diện (backend dùng 3 vai trò cố định: Physician, Nurse/Lễ tân, Admin).
//
// Quyền chỉ có ý nghĩa khi MÁY CHỦ ép: mỗi endpoint FastAPI kiểm tra vai trò của người gọi (require_roles) và trả 403
// FORBIDDEN nếu không được phép. Bảng dưới chỉ để ẩn / khoá nút cho dễ dùng, không phải lớp bảo vệ.

// 3 vai trò cố định theo Proposal.
export const ROLE_KEYS = ['doctor', 'reception', 'admin']

export const ACTIONS = [
  { key: 'view', label: 'View' },
  { key: 'add', label: 'Add' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
  { key: 'print', label: 'Print' }
]

export const MODULES = [
  { key: 'registration', label: 'Registration', actions: ['view', 'add', 'edit', 'delete', 'print'] },
  { key: 'patients', label: 'Patient records', actions: ['view', 'add', 'edit', 'delete', 'print'] },
  { key: 'consultation', label: 'Consultation', actions: ['view', 'add', 'edit', 'print'] },
  { key: 'prescribing', label: 'Prescribing', actions: ['view', 'add', 'edit', 'print'] },
  { key: 'labs', label: 'Lab orders', actions: ['view', 'add', 'edit', 'delete', 'print'] },
  { key: 'payments', label: 'Payments & invoices', actions: ['view', 'add', 'edit', 'print'] },
  { key: 'stock', label: 'Stock & expiry', actions: ['view', 'add', 'edit', 'print'] },
  { key: 'reports_revenue', label: 'Revenue report', actions: ['view', 'print'] },
  { key: 'reports_ai', label: 'AI effectiveness report', actions: ['view', 'print'] },
  { key: 'ai_config', label: 'AI configuration', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'catalogs', label: 'Catalog management', actions: ['view', 'add', 'edit', 'delete', 'print'] },
  { key: 'history', label: 'Activity history', actions: ['view', 'print'] },
  { key: 'staff', label: 'Staff accounts', actions: ['view', 'add', 'edit'] }
]

// Quyền nghiệp vụ đặc biệt, ngoài Xem / Thêm / Sửa / Xoá / In.
export const SPECIALS = [
  { key: 'rx.finalize', label: 'Finalize prescriptions', desc: 'Lock a prescription so it can no longer be edited' },
  { key: 'patient.clinical', label: 'View full medical records', desc: 'Diagnoses, consultation notes and lab results — not just administrative details' },
  { key: 'ai.approve', label: 'Approve AI rules', desc: 'Clinical sign-off before an AI rule change goes live' },
  { key: 'invoice.void', label: 'Cancel invoices', desc: 'Void an issued invoice (a reason is required and logged)' },
  { key: 'data.export', label: 'Export data', desc: 'Download lists, reports and the activity log as Excel / CSV' }
]

const all = (m) => MODULES.find((x) => x.key === m).actions.map((a) => m + '.' + a)
const some = (m, ...acts) => acts.map((a) => m + '.' + a)

// QUYỀN TỐI THIỂU: Quản trị viên quản lý hệ thống, kho và xem nhật ký — KHÔNG khám, kê đơn hay xem dữ liệu bệnh nhân
// (Quy định v5 §7). Duyệt quy tắc AI là việc của bác sĩ.
const GRANTS = {
  doctor: [
    ...some('registration', 'view'),
    ...some('patients', 'view', 'edit', 'print'),
    ...all('consultation'),
    ...all('prescribing'),
    ...some('labs', 'view', 'add', 'edit', 'print'),
    ...some('stock', 'view'),
    ...some('reports_ai', 'view'),
    ...some('ai_config', 'view'),
    ...some('catalogs', 'view'),
    'rx.finalize',
    'patient.clinical',
    'ai.approve'
  ],
  reception: [
    ...all('registration'),
    ...some('patients', 'view', 'add', 'edit', 'print'),
    ...some('prescribing', 'view', 'print'),
    ...some('labs', 'view', 'print'),
    ...all('payments'),
    'invoice.void',
    ...all('stock'),
    ...some('catalogs', 'view')
  ],
  admin: [
    ...some('payments', 'view', 'print'),
    ...all('stock'),
    ...all('reports_revenue'),
    ...all('reports_ai'),
    ...all('ai_config'),
    ...all('catalogs'),
    ...all('history'),
    ...all('staff'),
    'invoice.void',
    'data.export'
  ]
}
const SETS = Object.fromEntries(ROLE_KEYS.map((r) => [r, new Set(GRANTS[r])]))

// Nhãn hiển thị của 1 mã quyền (tiếng Anh — được dịch khi hiển thị). Dùng cho dữ liệu cũ trong nhật ký.
export function permLabel(k) {
  const sp = SPECIALS.find((s) => s.key === k)
  if (sp) return [sp.label]
  const [m, a] = k.split('.')
  return [MODULES.find((x) => x.key === m)?.label ?? m, ACTIONS.find((x) => x.key === a)?.label ?? a]
}

export const getPermissions = () => GRANTS
// Giữ chữ ký cũ để các trang không phải sửa; quyền không đổi lúc chạy nên chỉ trả bảng cố định.
export const usePermissions = () => GRANTS
export const can = (roleKey, perm) => !!SETS[roleKey]?.has(perm)
