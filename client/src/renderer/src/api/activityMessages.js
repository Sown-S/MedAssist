// Hiển thị nhật ký theo NGÔN NGỮ GIAO DIỆN: nhật ký chỉ lưu mã hành động + tham số,
// câu mô tả được dựng lúc hiển thị → không còn cảnh dòng tiếng Anh lẫn giữa các dòng tiếng Việt.
import { getLang, translate } from '../i18n'
import { permLabel } from './permissionStore'

const ROLE_LABEL = { admin: 'Administrator', doctor: 'Doctor', reception: 'Receptionist' }
export const roleLabel = (k) => translate(ROLE_LABEL[k] ?? k ?? '')

const REASONS = {
  lost: ['lost', 'mất'],
  damaged: ['broken / damaged', 'hỏng / vỡ'],
  expired: ['expired, not yet disposed', 'hết hạn chưa huỷ'],
  entry: ['data entry error at receipt', 'nhầm khi nhập kho'],
  dispense: ['dispensing error', 'nhầm khi xuất'],
  other: ['other', 'khác'],
  differs: ['clinical picture differs', 'bệnh cảnh không phù hợp'],
  known: ['already diagnosed', 'đã có chẩn đoán'],
  info: ['insufficient information', 'thiếu thông tin'],
  broad: ['rule too broad', 'quy tắc quá rộng']
}
const money = (n) => (Number(n) || 0).toLocaleString('vi-VN') + 'đ'

// [tiếng Anh, tiếng Việt] — mỗi mục nhận params p.
const M = {
  'auth.login': () => ['Signed in', 'Đăng nhập'],
  'auth.logout': () => ['Signed out', 'Đăng xuất'],
  'auth.login_failed': (p) => [`Failed sign-in for "${p.username}"`, `Đăng nhập thất bại với tài khoản "${p.username}"`],
  'auth.password_changed': () => ['Changed own password', 'Tự đổi mật khẩu'],
  'auth.auto_logout': (p) => [`Signed out automatically after ${p.minutes} minutes of inactivity`, `Tự đăng xuất sau ${p.minutes} phút không thao tác`],
  'settings.update': (p) => [`Settings changed — ${p.field}`, `Đổi cài đặt — ${translate(p.field)}`],
  'backup.create': (p) => [`Data backup created — ${p.file}`, `Sao lưu dữ liệu — ${p.file}`],
  'backup.restore': (p) => [`Data restored from backup ${p.file}`, `Khôi phục dữ liệu từ bản sao lưu ${p.file}`],
  'patient.create': (p) => [`Created patient record ${p.patient}`, `Tạo hồ sơ bệnh nhân ${p.patient}`],
  'patient.delete': (p) => [`Deleted patient record ${p.patient}`, `Xoá hồ sơ bệnh nhân ${p.patient}`],
  'patient.clinical_update': (p) => [
    `Updated allergies / chronic conditions — ${p.patient} (allergies: ${p.allergies}; conditions: ${p.history})`,
    `Cập nhật dị ứng / bệnh nền — ${p.patient} (dị ứng: ${p.allergies}; bệnh nền: ${p.history})`
  ],
  'patient.update': (p) => [`Updated patient details — ${p.patient}${p.fields ? ' (' + p.fields + ')' : ''}`, `Sửa thông tin bệnh nhân — ${p.patient}${p.fields ? ' (' + p.fields + ')' : ''}`],
  'patient.view': (p) => [`Viewed patient record — ${p.patient}`, `Xem hồ sơ bệnh nhân — ${p.patient}`],
  'queue.priority': (p) => [`Flagged as priority — ${p.patient} (${p.reason})`, `Đánh dấu ưu tiên — ${p.patient} (${translate(p.reason)})`],
  'lab.order': (p) => [`Ordered lab tests — ${p.patient}: ${p.tests}`, `Chỉ định xét nghiệm — ${p.patient}: ${p.tests}`],
  'rx.returned': (p) => [`Prescription sent back to ${p.doctor} to change drugs — ${p.patient}: ${p.note}`, `Trả đơn về ${p.doctor} để đổi thuốc — ${p.patient}: ${p.note}`],
  'rx.finalize': (p) => [`Finalized prescription #${p.rx} (locked, no further edits)`, `Chốt đơn thuốc #${p.rx} (đã khoá, không sửa được)`],
  'invoice.line_removed': (p) => [`Removed "${p.item}" from invoice #${p.invoice}`, `Bỏ "${p.item}" khỏi hoá đơn #${p.invoice}`],
  'invoice.line_added': (p) => [
    `Added "${p.item}" ×${p.qty} from a paper prescription to invoice #${p.invoice} — ${p.patient}${p.prescriber ? ` · prescription-only, prescribed by ${p.prescriber}` : ''}`,
    `Thêm "${p.item}" ×${p.qty} theo đơn giấy vào hoá đơn #${p.invoice} — ${p.patient}${p.prescriber ? ` · thuốc kê đơn, người kê: ${p.prescriber}` : ''}`
  ],
  'invoice.essential_removed': (p) => [
    `Removed ESSENTIAL drug "${p.item}" from invoice #${p.invoice} — warning acknowledged`,
    `Bỏ thuốc THIẾT YẾU "${p.item}" khỏi hoá đơn #${p.invoice} — đã xác nhận cảnh báo`
  ],
  'lab.result': (p) => [`Entered lab result ${p.test} — ${p.patient}`, `Nhập kết quả xét nghiệm ${p.test} — ${p.patient}`],
  'ai.suggestion_shown': (p) => [`AI suggestions shown — ${p.patient}: ${p.suggestions}`, `Hiển thị gợi ý AI — ${p.patient}: ${p.suggestions}`],
  'ai.suggestion_accepted': (p) => [`Doctor accepted AI suggestion ${p.code} — ${p.patient}`, `Bác sĩ chấp nhận gợi ý AI ${p.code} — ${p.patient}`],
  'ai.suggestion_dismissed': (p) => [
    `Doctor dismissed AI suggestion ${p.code} — ${p.patient} (${REASONS[p.reason]?.[0] ?? p.reason})`,
    `Bác sĩ bỏ qua gợi ý AI ${p.code} — ${p.patient} (${REASONS[p.reason]?.[1] ?? p.reason})`
  ],
  'ai.rules_updated': () => ['Updated AI rules', 'Cập nhật quy tắc AI'],
  'ai.rule_draft': (p) => [`AI rule ${p.rule}: ${p.op ?? 'draft saved'}`, `Quy tắc AI ${p.rule}: ${translate(p.op ?? 'Draft saved').toLowerCase()}`],
  'ai.rule_submitted': (p) => [`AI rule ${p.rule} submitted for doctor review`, `Quy tắc AI ${p.rule} được gửi bác sĩ duyệt`],
  'ai.rule_approved': (p) => [`AI rule ${p.rule} approved and applied`, `Quy tắc AI ${p.rule} được duyệt và áp dụng`],
  'ai.rule_rejected': (p) => [`AI rule ${p.rule} rejected`, `Quy tắc AI ${p.rule} bị từ chối`],
  'ai.rule_disabled': (p) => [
    `AI rule ${p.rule} turned off immediately (safety switch)${p.note ? ': ' + p.note : ''}`,
    `Quy tắc AI ${p.rule} bị tắt ngay (công tắc an toàn)${p.note ? ': ' + p.note : ''}`
  ],
  'ai.settings': (p) => [`AI configuration changed — ${p.op ?? ''} ${p.item ?? ''}`.trim(), `Đổi cấu hình AI — ${translate(p.op ?? '')} ${p.item ?? ''}`.trim()],
  'ai.ddi': (p) => [`Drug interaction pair ${p.item}: ${p.op}`, `Cặp tương tác thuốc ${p.item}: ${translate(p.op).toLowerCase()}`],
  'account.create': (p) => [`Created account ${p.account} (${roleLabelEn(p.role)})`, `Tạo tài khoản ${p.account} (${roleLabel(p.role)})`],
  'account.disable': (p) => [`Disabled account ${p.account}`, `Vô hiệu hoá tài khoản ${p.account}`],
  'account.enable': (p) => [`Re-enabled account ${p.account}`, `Kích hoạt lại tài khoản ${p.account}`],
  'account.reset_password': (p) => [`Reset password for account ${p.account}`, `Đặt lại mật khẩu cho tài khoản ${p.account}`],
  'account.update': (p) => [
    `Updated account ${p.account} (${(p.fields ?? []).join(', ')})`,
    `Sửa thông tin tài khoản ${p.account} (${(p.fields ?? []).map(translate).join(', ').toLowerCase()})`
  ],
  'account.role_change': (p) => [
    `Changed role of account ${p.account}: ${roleLabelEn(p.from)} → ${roleLabelEn(p.to)}`,
    `Đổi vai trò tài khoản ${p.account}: ${roleLabel(p.from)} → ${roleLabel(p.to)}`
  ],
  'account.locked': (p) => [
    `Account ${p.account} locked after ${p.n} failed sign-ins${p.minutes ? ` for ${p.minutes} minutes` : ''}`,
    `Khoá tài khoản ${p.account} sau ${p.n} lần đăng nhập sai${p.minutes ? ` trong ${p.minutes} phút` : ''}`
  ],
  'account.unlock': (p) => [`Unlocked account ${p.account}`, `Mở khoá tài khoản ${p.account}`],
  'account.force_logout': (p) => [`Forced sign-out of account ${p.account}`, `Buộc đăng xuất tài khoản ${p.account}`],
  'role.permissions': (p) => [
    `${p.restoredDefaults ? 'Restored default permissions' : 'Changed permissions'} of role "${roleLabelEn(p.role)}"${permChanges(p, (x) => x)}`,
    `${p.restoredDefaults ? 'Khôi phục quyền mặc định' : 'Đổi quyền'} của vai trò "${roleLabel(p.role)}"${permChanges(p, translate)}`
  ],
  'drug.create': (p) => [`Drug catalog: added ${p.drug}`, `Danh mục thuốc: thêm ${p.drug}`],
  'drug.update': (p) => [`Drug catalog: updated ${p.drug}`, `Danh mục thuốc: sửa ${p.drug}`],
  'drug.discontinue': (p) => [`Drug catalog: discontinued ${p.drug}`, `Danh mục thuốc: ngừng sử dụng ${p.drug}`],
  'drug.reactivate': (p) => [`Drug catalog: re-activated ${p.drug}`, `Danh mục thuốc: dùng lại ${p.drug}`],
  'stock.receive': (p) => [`Received ${p.qty} × ${p.drug}, lot ${p.lot} (${p.ref})`, `Nhập kho ${p.qty} × ${p.drug}, lô ${p.lot} (${p.ref})`],
  'stock.adjust': (p) => [
    `Stock adjusted — ${p.drug}, lot ${p.lot}${p.reason ? ' (' + (REASONS[p.reason]?.[0] ?? p.reason) + ')' : ''}`,
    `Điều chỉnh tồn — ${p.drug}, lô ${p.lot}${p.reason ? ' (' + (REASONS[p.reason]?.[1] ?? p.reason) + ')' : ''}`
  ],
  'stock.return': (p) => [`Returned to stock — invoice ${p.ref} cancelled: ${p.summary}`, `Hoàn kho do huỷ hoá đơn ${p.ref}: ${p.summary}`],
  'stock.dispense': (p) => [`Stock issued automatically for ${p.ref} — ${p.summary}`, `Tự động xuất kho cho ${p.ref} — ${p.summary}`],
  'stocktake.start': (p) => [`Stocktake session ${p.session} opened (${p.n} batches)`, `Mở phiên kiểm kho ${p.session} (${p.n} lô)`],
  'stocktake.cancel': (p) => [`Stocktake session ${p.session} cancelled`, `Huỷ phiên kiểm kho ${p.session}`],
  'stocktake.close': (p) => [`Stocktake session ${p.session} closed — ${p.n} adjustments`, `Chốt phiên kiểm kho ${p.session} — ${p.n} điều chỉnh`],
  'stock.dispose': (p) => [`Expired stock disposed — record ${p.no} (${p.n} batches)`, `Huỷ thuốc hết hạn — biên bản ${p.no} (${p.n} lô)`],
  'supplier.create': (p) => [`Supplier added — ${p.supplier}`, `Thêm nhà cung cấp — ${p.supplier}`],
  'supplier.update': (p) => [`Supplier updated — ${p.supplier}`, `Sửa nhà cung cấp — ${p.supplier}`],
  'supplier.deactivate': (p) => [`Supplier deactivated — ${p.supplier}`, `Ngừng hợp tác nhà cung cấp — ${p.supplier}`],
  'supplier.reactivate': (p) => [`Supplier re-activated — ${p.supplier}`, `Hợp tác lại nhà cung cấp — ${p.supplier}`],
  'supplier.payment': (p) => [`Payment of ${money(p.amount)} to ${p.supplier} (${p.payment})`, `Thanh toán ${money(p.amount)} cho ${p.supplier} (${p.payment})`],
  'cash.create': (p) => [
    `${p.type === 'thu' ? 'Receipt' : 'Expense'} voucher ${p.voucher} — ${p.category} ${money(p.amount)}${p.pending ? ' (awaiting approval)' : ''}${p.selfApproved ? ' (above the approval limit — self-approved by the creator)' : ''}`,
    `Lập ${p.type === 'thu' ? 'phiếu thu' : 'phiếu chi'} ${p.voucher} — ${p.category} ${money(p.amount)}${p.pending ? ' (chờ duyệt)' : ''}${p.selfApproved ? ' (vượt hạn mức — người lập tự duyệt)' : ''}`
  ],
  'cash.approve': (p) => [`Approved expense voucher ${p.voucher} (${money(p.amount)})`, `Duyệt phiếu chi ${p.voucher} (${money(p.amount)})`],
  'cash.void': (p) => [
    `${p.wasPending ? 'Rejected' : 'Cancelled'} voucher ${p.voucher} (${money(p.amount)}) — ${p.reason}`,
    `${p.wasPending ? 'Từ chối' : 'Huỷ'} phiếu ${p.voucher} (${money(p.amount)}) — ${p.reason}`
  ],
  'cash.attach': (p) => [`Attached documents to voucher ${p.voucher}: ${p.files}`, `Đính kèm chứng từ vào phiếu ${p.voucher}: ${p.files}`],
  'shift.close': (p) => [
    `Closed shift — expected ${money(p.expected)}, counted ${money(p.counted)}, difference ${money(p.diff)}`,
    `Chốt ca — hệ thống ${money(p.expected)}, thực đếm ${money(p.counted)}, chênh lệch ${money(p.diff)}`
  ],
  'queue.visit_created': (p) => [`Registered visit for ${p.patient} — queue no. ${p.ticket}${p.priority ? ' (priority)' : ''}`, `Tiếp đón ${p.patient} — số thứ tự ${p.ticket}${p.priority ? ' (ưu tiên)' : ''}`],
  'queue.checked_in': (p) => [`Checked in ${p.patient} (no. ${p.ticket}) — ready to be called`, `Check-in ${p.patient} (số ${p.ticket}) — sẵn sàng vào khám`],
  'queue.check_in': (p) => [`Checked in ${p.patient} — queue no. ${p.ticket}${p.priority ? ' (priority)' : ''}`, `Tiếp đón ${p.patient} — số thứ tự ${p.ticket}${p.priority ? ' (ưu tiên)' : ''}`],
  'invoice.issue': (p) => [
    `Issued invoice ${p.invoice} — ${p.patient} ${money(p.amount)}${p.status === 'pending' ? ' (awaiting payment)' : ''}`,
    `Lập hoá đơn ${p.invoice} — ${p.patient} ${money(p.amount)}${p.status === 'pending' ? ' (chờ thanh toán)' : ''}`
  ],
  'invoice.update': (p) => [`Updated invoice ${p.invoice} — ${p.patient} ${money(p.amount)}`, `Sửa hoá đơn ${p.invoice} — ${p.patient} ${money(p.amount)}`],
  'rx.dispensed': (p) => [`Dispensed ${p.item} ×${p.qty} — ${p.patient}`, `Cấp ${p.item} ×${p.qty} — ${p.patient}`],
  'rx.skipped': (p) => [`Skipped ${p.item} at dispensing — ${p.patient}: ${p.reason}`, `Bỏ qua ${p.item} khi cấp phát — ${p.patient}: ${p.reason}`],
  'invoice.confirm': (p) => [`Payment collected for invoice ${p.invoice} — ${p.patient} ${money(p.amount)}`, `Đã thu tiền hoá đơn ${p.invoice} — ${p.patient} ${money(p.amount)}`],
  'invoice.void': (p) => [
    `Cancelled invoice ${p.invoice} — ${p.patient} ${money(p.amount)} (${p.reason})${p.approvedBy ? ` · approved by ${p.approvedBy}` : ''}${p.restocked ? ' · drugs returned to stock' : ''}`,
    `Huỷ hoá đơn ${p.invoice} — ${p.patient} ${money(p.amount)} (${p.reason})${p.approvedBy ? ` · ${p.approvedBy} xác nhận` : ''}${p.restocked ? ' · đã hoàn kho' : ''}`
  ],
  'queue.day_closed': (p) => [
    `Day ${p.day} closed with unfinished visits (left without finishing): ${p.left} · ${p.carried} unpaid visit(s) carried over`,
    `Đóng ngày ${p.day} còn lượt chưa khám xong (coi như bỏ về): ${p.left} · ${p.carried} lượt chưa thu tiền được chuyển sang hôm nay`
  ],
  'queue.red_flag_review': (p) => [
    `Doctor reviewed red-flag case — ${p.patient}: ${p.decision === 'seen' ? 'see at the clinic' : 'refer to hospital'}`,
    `Bác sĩ đánh giá ca cờ đỏ — ${p.patient}: ${p.decision === 'seen' ? 'khám tại phòng khám' : 'chuyển tuyến'}`
  ],
  'queue.red_flag': (p) => [`Red-flag referral — ${p.patient}: ${p.signs || '—'}`, `Chuyển tuyến cờ đỏ — ${p.patient}: ${p.signs || '—'}`],
  'queue.take_override': (p) => [
    `Called in priority patient ${p.patient} while still seeing ${p.current}`,
    `Mời bệnh nhân ưu tiên ${p.patient} khi vẫn đang khám ${p.current}`
  ],
  'visit.release': (p) => [`Returned ${p.patient} to the waiting queue`, `Trả ${p.patient} về hàng chờ`],
  'visit.handover': (p) => [
    `Handed over ${p.patient} ${p.to ? 'to ' + p.to : 'back to the waiting queue'}: ${p.note}`,
    `Bàn giao ${p.patient} ${p.to ? 'cho ' + p.to : 'về hàng chờ'}: ${p.note}`
  ],
  'visit.addendum': (p) => {
    const k = { note: ['note', 'ghi chú'], correction: ['correction', 'đính chính'], late_result: ['late lab result', 'kết quả về muộn'] }[p.kind] ?? [p.kind, p.kind]
    return [`Addendum (${k[0]}) to a finalized visit — ${p.patient}: ${p.text}`, `Ghi bổ sung (${k[1]}) vào lượt khám đã chốt — ${p.patient}: ${p.text}`]
  },
  'visit.cancel': (p) => {
    const r = { left_waiting: ['left before being called', 'về trước khi được gọi'], wrong_checkin: ['checked in by mistake / duplicate', 'tiếp đón nhầm / trùng lượt'], no_return: ['did not come back from lab tests', 'không quay lại sau xét nghiệm'], unpaid_left: ['left without paying', 'bỏ về không thanh toán'], other: ['other', 'lý do khác'] }[p.reason] ?? [p.reason, p.reason]
    return [`Cancelled visit no. ${p.ticket} — ${p.patient}: ${r[0]}${p.note ? ' (' + p.note + ')' : ''}`, `Huỷ lượt số ${p.ticket} — ${p.patient}: ${r[1]}${p.note ? ' (' + p.note + ')' : ''}`]
  },
  'visit.update': (p) => [`Updated waiting visit no. ${p.ticket} — ${p.patient}`, `Sửa lượt đang chờ số ${p.ticket} — ${p.patient}`],
  'queue.not_present': (p) => [`Called no. ${p.ticket} — ${p.patient} did not come in; moved to the end of the queue`, `Gọi số ${p.ticket} — ${p.patient} không có mặt; xuống cuối hàng chờ`],
  'duty.start': (p) => [`Started a consultation shift in ${p.room} (${p.dept})`, `Bắt đầu ca khám tại ${p.room} (${p.dept})`],
  'duty.break': (p) => [`Took a break — ${p.room}`, `Nghỉ giữa giờ — ${p.room}`],
  'duty.resume': (p) => [`Back from break — ${p.room}`, `Hết nghỉ, khám tiếp — ${p.room}`],
  'doc.print': (p) => {
    const d = { referral: ['referral letter', 'giấy chuyển tuyến'], sickleave: ['sick-leave certificate', 'giấy nghỉ ốm'], summary: ['medical summary', 'tóm tắt bệnh án'] }[p.doc] ?? [p.doc, p.doc]
    return [`Printed ${d[0]} — ${p.patient}`, `In ${d[1]} — ${p.patient}`]
  },
  'visit.left': (p) => {
    const r = { left_exam: ['left during the consultation', 'bỏ về khi đang khám'], no_return: ['did not come back from lab tests', 'không quay lại sau xét nghiệm'], refused: ['refused examination / treatment', 'từ chối khám / điều trị'], other: ['other', 'lý do khác'] }[p.reason] ?? [p.reason, p.reason]
    return [`Closed visit — ${p.patient} ${r[0]}${p.note ? ': ' + p.note : ''}`, `Đóng lượt khám — ${p.patient} ${r[1]}${p.note ? ': ' + p.note : ''}`]
  },
  'visit.take_over': (p) => [`Took over ${p.patient} from ${p.from}: ${p.reason}`, `Tiếp nhận ${p.patient} từ ${p.from}: ${p.reason}`],
  'shift.doctor_close': (p) => [
    `Ended consultation shift — ${p.visits} visits, ${p.rx} prescriptions, ${p.referred} referrals, ${p.overrides} severe-warning overrides`,
    `Kết thúc ca khám — ${p.visits} lượt khám, ${p.rx} đơn thuốc, ${p.referred} ca chuyển tuyến, ${p.overrides} lần kê dù cảnh báo nặng`
  ],
  'rx.recall': (p) => [`Recalled prescription no. ${p.rx} to edit (not yet paid) — ${p.patient}`, `Thu hồi đơn số ${p.rx} để sửa (chưa thu tiền) — ${p.patient}`],
  'rx.review': (p) => [
    `Reviewed prescription of ${p.day} — ${p.patient}: ${{ ok: 'appropriate', adjust: 'needs adjustment', concern: 'safety concern' }[p.verdict] ?? p.verdict}${p.note ? ` (${p.note})` : ''}`,
    `Đánh giá đơn thuốc ngày ${p.day} — ${p.patient}: ${{ ok: 'phù hợp', adjust: 'cần điều chỉnh', concern: 'lo ngại an toàn' }[p.verdict] ?? p.verdict}${p.note ? ` (${p.note})` : ''}`
  ],
  'rx.review_resolved': (p) => [`Handled prescription review of ${p.day} — ${p.patient}`, `Đã xử lý đánh giá đơn thuốc ngày ${p.day} — ${p.patient}`],
  'catalog.create': (p) => [`${p.catalog}: added ${p.code} ${p.name}`, `${translate(p.catalog)}: thêm ${p.code} ${p.name}`],
  'catalog.update': (p) => [`${p.catalog}: updated ${p.code} ${p.name}`, `${translate(p.catalog)}: sửa ${p.code} ${p.name}`],
  'catalog.discontinue': (p) => [`${p.catalog}: discontinued ${p.code} ${p.name}`, `${translate(p.catalog)}: ngừng sử dụng ${p.code} ${p.name}`],
  'catalog.reactivate': (p) => [`${p.catalog}: re-activated ${p.code} ${p.name}`, `${translate(p.catalog)}: dùng lại ${p.code} ${p.name}`],
  'catalog.import': (p) => [`${p.catalog}: imported ${p.file} (+${p.added}, ~${p.updated})`, `${translate(p.catalog)}: nhập file ${p.file} (+${p.added}, ~${p.updated})`],
  'audit.export': (p) => [`Exported the activity log (${p.n} entries, ${p.format})`, `Xuất nhật ký hoạt động (${p.n} dòng, ${p.format})`]
}
// "+ Thu chi · Thêm; − Hoá đơn · In" — tối đa 6 mục, còn lại ghi "+N".
function permChanges(p, tr) {
  const items = [...(p.added ?? []).map((k) => ['+', k]), ...(p.removed ?? []).map((k) => ['−', k])]
  if (!items.length) return ''
  const shown = items.slice(0, 6).map(([sign, k]) => sign + ' ' + permLabel(k).map(tr).join(' · '))
  return ': ' + shown.join('; ') + (items.length > 6 ? ` (+${items.length - 6})` : '')
}
function roleLabelEn(k) {
  return ROLE_LABEL[k] ?? k ?? ''
}

export function describe(e) {
  const f = M[e.action]
  if (!f) return e.action
  const [en, vi] = f(e.params ?? {})
  return getLang() === 'vi' ? vi : en
}

export const TYPE_LABEL = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  view: 'Read',
  finalize: 'Finalize',
  approve: 'Approve',
  reject: 'Reject',
  login: 'Sign in',
  logout: 'Sign out',
  export: 'Export'
}
export const LEVELS = {
  info: { label: 'Information', icon: 'help', cls: 'info' },
  warning: { label: 'Warning', icon: 'alert', cls: 'warn' },
  critical: { label: 'Critical', icon: 'ban', cls: 'low' }
}
export const TARGET_LABEL = {
  patient: 'Patient',
  prescription: 'Prescription no.',
  invoice: 'Invoice',
  drug: 'Drug',
  batch: 'Batch',
  stocktake: 'Stocktake session',
  disposal: 'Disposal record',
  supplier: 'Supplier',
  payment: 'Supplier payment',
  voucher: 'Cash voucher',
  shift: 'Shift close-out',
  catalog: 'Catalog',
  account: 'Account',
  role: 'Role',
  ai: 'AI configuration',
  settings: 'Settings',
  backup: 'Backup'
}
// Mã đối tượng để hiển thị (vai trò hiện tên theo ngôn ngữ thay vì khoá nội bộ).
export const targetId = (t) => (!t ? '' : t.kind === 'role' ? roleLabel(t.id) : t.id)

// Trang để "nhảy tới bản ghi liên quan" từ một dòng nhật ký.
export function targetPage(t) {
  if (!t) return null
  if (t.kind === 'patient') return { page: 'patients' }
  if (t.kind === 'invoice' || t.kind === 'prescription') return { page: 'invoices' }
  if (t.kind === 'drug' || t.kind === 'batch') return { page: 'inventory' }
  if (t.kind === 'catalog') return { page: t.page ?? 'catalog', params: t.page?.startsWith('cat-') ? { q: t.id } : null }
  if (t.kind === 'account') return { page: 'staff' }
  if (t.kind === 'ai') return { page: 'ai' }
  if (t.kind === 'settings' || t.kind === 'backup') return { page: 'settings', params: { tab: t.kind === 'backup' ? 'backup' : t.id } }
  return null
}
