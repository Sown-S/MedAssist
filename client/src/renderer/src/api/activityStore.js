// NHẬT KÝ HOẠT ĐỘNG (audit log) — lớp giả lập cho bảng audit_log của backend.
//
// Mỗi dòng lưu CÓ CẤU TRÚC: mã hành động + tham số (hiển thị theo ngôn ngữ giao diện ở activityMessages.js),
// loại thao tác, mức độ, đối tượng, giá trị trước / sau, kết quả, máy trạm.
//
// Bảo vệ nhật ký:
//  - Chỉ GHI THÊM: module này không có hàm sửa hay xoá dòng nào (kể cả cho Quản trị viên).
//  - Chuỗi băm: mỗi dòng chứa hash của dòng trước → sửa / xoá một dòng bất kỳ sẽ làm đứt chuỗi và bị phát hiện.
//    Hash ở đây (FNV-1a) chỉ để minh hoạ; backend thật dùng SHA-256 + bảng chỉ cho phép INSERT (không UPDATE/DELETE),
//    sao lưu hằng ngày ra nơi lưu trữ không ghi đè được.
//  - Chỉ Quản trị viên được xem (trang Lịch sử hoạt động nằm trong khu Quản trị).
import { useSyncExternalStore } from 'react'

const KEY = 'medassist_audit_v2'
// Thời gian lưu nhật ký: Cài đặt › Sao lưu & lưu trữ (settingsStore.retention.auditYears).

// ---------- Máy trạm: mã cố định cho mỗi máy cài app ----------
function workstation() {
  try {
    let ws = localStorage.getItem('medassist_ws')
    if (!ws) {
      ws = 'WS-' + Math.random().toString(36).slice(2, 6).toUpperCase()
      localStorage.setItem('medassist_ws', ws)
    }
    return ws
  } catch {
    return 'WS-?'
  }
}

function fnv(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
const body = (e) => JSON.stringify([e.seq, e.at, e.actor, e.action, e.type, e.level, e.result, e.target, e.before, e.after, e.params, e.ws, e.prev])

// ---------- Dữ liệu mẫu (trước đây là các dòng chữ tự do trong mockData) ----------
const ROLE = { admin: 'admin', doctor: 'doctor', reception: 'reception' }
function seedEntries() {
  const d = (days, hms) => {
    const t = new Date()
    t.setDate(t.getDate() - days)
    const [h, m, s] = hms.split(':').map(Number)
    t.setHours(h, m, s, 0)
    return t.toISOString()
  }
  const mai = { name: 'Nguyễn Thị Mai', username: 'mai.nguyen', role: ROLE.reception }
  const dung = { name: 'Nguyễn Văn Dũng', username: 'dung.nguyen', role: ROLE.doctor }
  const minh = { name: 'Trần Minh', username: 'minh.tran', role: ROLE.doctor }
  const lan = { name: 'Trần Thị Lan', username: 'admin', role: ROLE.admin }
  const ws = ['WS-LT01', 'WS-PK01', 'WS-PK02', 'WS-QT01']
  return [
    [1, '07:55:10', mai, 'auth.login', {}, null, null, ws[0]],
    [1, '07:58:40', minh, 'auth.login_failed', { username: 'minh.tran' }, null, null, ws[1], 'failure'],
    [1, '07:59:02', minh, 'auth.login', {}, null, null, ws[1]],
    [1, '08:12:04', mai, 'patient.create', { patient: '00000143' }, { kind: 'patient', id: '00000143' }, null, ws[0]],
    [1, '08:25:17', mai, 'queue.priority', { patient: 'Minh Anh', reason: 'child, high fever' }, { kind: 'patient', id: '00000144', label: 'Minh Anh' }, null, ws[0]],
    [1, '09:10:44', minh, 'patient.view', { patient: 'Nguyễn Thị Lan' }, { kind: 'patient', id: '00000123', label: 'Nguyễn Thị Lan' }, null, ws[1]],
    [1, '09:11:02', minh, 'ai.suggestion_shown', { patient: 'Nguyễn Thị Lan', suggestions: 'J03.9, J02.9' }, { kind: 'patient', id: '00000123', label: 'Nguyễn Thị Lan' }, null, ws[1]],
    [1, '09:14:37', minh, 'ai.suggestion_accepted', { patient: 'Nguyễn Thị Lan', code: 'J03.9' }, { kind: 'patient', id: '00000123', label: 'Nguyễn Thị Lan' }, null, ws[1]],
    [1, '09:15:30', dung, 'patient.update', { patient: '123' }, { kind: 'patient', id: '00000123' }, null, ws[2]],
    [1, '09:18:02', minh, 'rx.finalize', { rx: '451' }, { kind: 'prescription', id: '451' }, null, ws[1]],
    [1, '09:22:41', mai, 'invoice.line_removed', { invoice: '98', item: 'Vitamin C effervescent' }, { kind: 'invoice', id: '98' }, null, ws[0]],
    [1, '09:24:05', mai, 'invoice.essential_removed', { invoice: '98', item: 'Amoxicillin 500mg' }, { kind: 'invoice', id: '98' }, null, ws[0]],
    [1, '09:30:11', lan, 'ai.rules_updated', {}, { kind: 'ai', id: 'rules' }, null, ws[3]],
    [1, '09:42:33', lan, 'stock.adjust', { drug: 'Amoxicillin 500mg', lot: 'AM2508', reason: 'lost' }, { kind: 'drug', id: 'D02', label: 'Amoxicillin 500mg' }, [85, 82], ws[3]],
    [1, '10:05:12', dung, 'lab.result', { test: 'CBC', patient: 'Nguyễn Thị Lan' }, { kind: 'patient', id: '00000123', label: 'Nguyễn Thị Lan' }, null, ws[2]],
    [1, '10:12:40', lan, 'account.reset_password', { account: 'hung.tran' }, { kind: 'account', id: 'hung.tran' }, null, ws[3]],
    [1, '10:20:03', lan, 'role.permissions', { role: 'reception' }, { kind: 'role', id: 'reception' }, null, ws[3]],
    [1, '17:30:00', mai, 'auth.logout', {}, null, null, ws[0]]
  ].map(([days, hms, actor, action, params, target, ba, ws, result]) => ({
    at: d(days, hms),
    actor,
    action,
    params,
    target,
    before: ba ? ba[0] : null,
    after: ba ? ba[1] : null,
    ws,
    result: result ?? 'success'
  }))
}

// ---------- Kho ----------
function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
let entries = []
const listeners = new Set()
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    /* chỉ giữ trong phiên */
  }
  listeners.forEach((fn) => fn())
}

// Loại thao tác & mức độ mặc định của từng mã hành động.
export const ACTION_META = {
  'auth.login': ['login', 'info'],
  'auth.logout': ['logout', 'info'],
  'auth.login_failed': ['login', 'warning'],
  'auth.password_changed': ['update', 'info'],
  'auth.auto_logout': ['logout', 'info'],
  'settings.update': ['update', 'warning'],
  'backup.create': ['export', 'info'],
  'backup.restore': ['update', 'critical'],
  'patient.create': ['create', 'info'],
  'patient.update': ['update', 'info'],
  'patient.delete': ['delete', 'warning'],
  'patient.view': ['view', 'info'],
  'queue.priority': ['update', 'info'],
  'rx.finalize': ['finalize', 'info'],
  'invoice.line_removed': ['update', 'info'],
  'invoice.essential_removed': ['update', 'critical'],
  'lab.result': ['create', 'info'],
  'ai.suggestion_shown': ['view', 'info'],
  'ai.suggestion_accepted': ['approve', 'info'],
  'ai.suggestion_dismissed': ['reject', 'info'],
  'ai.rules_updated': ['update', 'warning'],
  'ai.rule_draft': ['update', 'info'],
  'ai.rule_submitted': ['update', 'info'],
  'ai.rule_approved': ['approve', 'warning'],
  'ai.rule_rejected': ['reject', 'info'],
  'ai.rule_disabled': ['update', 'warning'],
  'ai.settings': ['update', 'warning'],
  'ai.ddi': ['update', 'warning'],
  'account.create': ['create', 'info'],
  'account.disable': ['update', 'warning'],
  'account.enable': ['update', 'info'],
  'account.reset_password': ['update', 'warning'],
  'account.update': ['update', 'info'],
  'account.role_change': ['update', 'critical'],
  'account.locked': ['update', 'warning'],
  'account.unlock': ['update', 'warning'],
  'account.force_logout': ['update', 'warning'],
  'role.permissions': ['update', 'critical'],
  'drug.create': ['create', 'info'],
  'drug.update': ['update', 'info'],
  'drug.discontinue': ['update', 'warning'],
  'drug.reactivate': ['update', 'info'],
  'stock.receive': ['create', 'info'],
  'stock.adjust': ['update', 'warning'],
  'stock.dispense': ['create', 'info'],
  'invoice.update': ['update', 'info'],
  'rx.dispensed': ['update', 'info'],
  'rx.skipped': ['update', 'warning'],
  'stocktake.start': ['create', 'info'],
  'stocktake.cancel': ['delete', 'warning'],
  'stocktake.close': ['finalize', 'warning'],
  'stock.dispose': ['delete', 'critical'],
  'supplier.create': ['create', 'info'],
  'supplier.update': ['update', 'info'],
  'supplier.deactivate': ['update', 'warning'],
  'supplier.reactivate': ['update', 'info'],
  'supplier.payment': ['create', 'warning'],
  'cash.create': ['create', 'info'],
  'cash.approve': ['approve', 'warning'],
  'cash.void': ['delete', 'warning'],
  'cash.attach': ['update', 'info'],
  'shift.close': ['finalize', 'info'],
  'queue.red_flag': ['create', 'warning'],
  'queue.take_override': ['update', 'warning'],
  'rx.recall': ['update', 'warning'],
  'visit.release': ['update', 'info'],
  'visit.take_over': ['update', 'warning'],
  'visit.left': ['update', 'warning'],
  'visit.addendum': ['create', 'info'],
  'doc.print': ['export', 'info'],
  'duty.start': ['login', 'info'],
  'queue.not_present': ['update', 'info'],
  'visit.cancel': ['delete', 'warning'],
  'visit.update': ['update', 'info'],
  'duty.break': ['update', 'info'],
  'duty.resume': ['update', 'info'],
  'shift.doctor_close': ['finalize', 'info'],
  'rx.review': ['create', 'info'],
  'rx.review_resolved': ['update', 'info'],
  'queue.check_in': ['create', 'info'],
  'queue.visit_created': ['create', 'info'],
  'queue.checked_in': ['update', 'info'],
  'invoice.void': ['delete', 'warning'],
  'invoice.issue': ['create', 'info'],
  'invoice.confirm': ['update', 'info'],
  'catalog.create': ['create', 'info'],
  'catalog.update': ['update', 'info'],
  'catalog.discontinue': ['update', 'warning'],
  'catalog.reactivate': ['update', 'info'],
  'catalog.import': ['create', 'warning'],
  'audit.export': ['export', 'info']
}

function append(raw) {
  const prev = entries[0]
  const [type, defLevel] = ACTION_META[raw.action] ?? ['update', 'info']
  const e = {
    seq: (prev?.seq ?? 0) + 1,
    at: raw.at ?? new Date().toISOString(),
    actor: raw.actor,
    action: raw.action,
    type,
    level: raw.level ?? (raw.result === 'failure' && defLevel === 'info' ? 'warning' : defLevel),
    result: raw.result ?? 'success',
    target: raw.target ?? null,
    before: raw.before ?? null,
    after: raw.after ?? null,
    params: raw.params ?? {},
    ws: raw.ws ?? workstation(),
    prev: prev?.hash ?? '0'
  }
  e.hash = fnv(body(e))
  entries = [e, ...entries]
}

{
  const saved = read()
  if (Array.isArray(saved) && saved.length) entries = saved
  else {
    for (const r of seedEntries().sort((a, b) => a.at.localeCompare(b.at))) append(r)
    persist()
  }
}

const actorOf = (user) => (user ? { name: user.name ?? user.fullName ?? '?', username: user.username ?? '', role: user.roleKey ?? user.role ?? '' } : { name: 'System', username: '', role: '' })

// Ghi 1 sự kiện. opts: { target: {kind, id, label}, params, before, after, result, level }
export function logEvent(user, action, opts = {}) {
  append({ actor: actorOf(user), action, ...opts })
  persist()
}

// Kiểm tra toàn vẹn: tính lại hash từng dòng và nối chuỗi. Trả về số thứ tự dòng đầu tiên bị sai (nếu có).
export function verifyChain(list = entries) {
  const asc = [...list].sort((a, b) => a.seq - b.seq)
  let prev = '0'
  for (let i = 0; i < asc.length; i++) {
    const e = asc[i]
    if (e.seq !== i + 1) return { ok: false, at: i + 1, reason: 'missing' }
    if (e.prev !== prev || fnv(body(e)) !== e.hash) return { ok: false, at: e.seq, reason: 'modified' }
    prev = e.hash
  }
  return { ok: true, count: asc.length }
}

const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getActivity = () => entries
export function useActivity() {
  return useSyncExternalStore(subscribe, getActivity)
}
