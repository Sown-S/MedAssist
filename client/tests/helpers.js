import { vi } from 'vitest'

// Các store giả lập giữ dữ liệu trong biến của module + localStorage. Mỗi test gọi fresh() để có
// một phòng khám "mới mở app": xoá localStorage, nạp lại toàn bộ module (dữ liệu mẫu tạo lại từ đầu).
export async function fresh() {
  vi.resetModules()
  localStorage.clear()
  const [queue, inventory, invoices, patients, settings, activity, accounts, rooms, clinic] = await Promise.all([
    import('../src/renderer/src/api/queueStore.js'),
    import('../src/renderer/src/api/inventoryStore.js'),
    import('../src/renderer/src/api/invoiceStore.js'),
    import('../src/renderer/src/api/patientStore.js'),
    import('../src/renderer/src/api/settingsStore.js'),
    import('../src/renderer/src/api/activityStore.js'),
    import('../src/renderer/src/api/accountStore.js'),
    import('../src/renderer/src/api/roomStore.js'),
    import('../src/renderer/src/api/clinicApi.js')
  ])
  return { queue, inventory, invoices, patients, settings, activity, accounts, rooms, clinic }
}

// Người dùng mẫu (đúng hình dạng user trong AuthContext).
export const DOC_A = { id: 'u-doc-a', name: 'BS Trần Minh', roleKey: 'doctor', room: 'Phòng khám 01' }
export const DOC_B = { id: 'u-doc-b', name: 'BS Nguyễn Văn Dũng', roleKey: 'doctor', room: 'Phòng khám 02' }
export const DESK = { id: 'u-desk', name: 'Nguyễn Thị Mai', roleKey: 'reception' }
export const ADMIN = { id: 'u-admin', name: 'Trần Thị Lan', roleKey: 'admin' }

// Hạn dùng cách hôm nay n ngày (yyyy-mm-dd).
export function inDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Tiếp đón một bệnh nhân trong danh bạ mẫu → lượt Waiting.
export function admit(s, index = 0, opts = {}) {
  tick()
  const p = s.patients.getPatients()[index]
  const r = s.queue.createVisit(p, { reason: 'Ho, sốt', priority: false, ...opts }, DESK)
  if (!r.ok) throw new Error(r.error)
  return r.visit
}

// Tiếp đón + check-in → lượt CheckedIn, bác sĩ nhận được.
export function admitReady(s, index = 0, opts = {}) {
  const v = admit(s, index, opts)
  const r = s.queue.checkInVisit(v.id, DESK)
  if (!r.ok) throw new Error(r.error)
  return v
}

// Bản demo đặt id theo Date.now() — chờ sang mili giây mới để hai lượt tạo liền nhau không trùng id.
export function tick() {
  const t = Date.now()
  while (Date.now() === t);
}

// Lượt hiện tại trong hàng chờ theo id.
export const visitOf = (s, id) => s.queue.getQueue().visits.find((v) => v.id === id)

// Bỏ hết dữ liệu mẫu của hàng chờ hôm nay (giữ lại các lượt test tự tạo) — để takeNext, nextTicket… không bị lượt mẫu chen vào.
export function emptyQueue(s) {
  for (const v of s.queue.getQueue().visits.filter((x) => s.queue.isQueued(x))) s.queue.cancelVisit(v.id, { reason: 'wrong_checkin' }, DESK)
}
