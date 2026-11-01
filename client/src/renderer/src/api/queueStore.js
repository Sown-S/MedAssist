// Hàng chờ trong ngày và ca cờ đỏ: lấy từ GET /queue (useQueueSync), mọi thao tác gọi API rồi đồng bộ lại.
// Máy chỉ giữ vài trường riêng của phiên này (dấu “đã xem” ca cờ đỏ, resumedFromLabs).
import { useEffect, useSyncExternalStore } from 'react'
import { fetchQueue, fetchStale, cancelStale as apiCancelStale, labReturn as apiLabReturn, checkIn as apiCheckIn, cancelVisit as apiCancelVisit, startExam as apiStartExam, releaseVisit as apiRelease, callNext as apiCallNext, callVisit as apiCallVisit, cancelCall as apiCancelCall } from './clinicApi'
import { reopenPrescription as apiReopen } from './examApi'
import { VI } from '../i18n/vi'

// Trạng thái lượt khám theo backend: Waiting → CheckedIn → Examining → Prescribed → Finished, hoặc Cancelled.
// Bác sĩ chỉ nhận được người đã CheckedIn; đi xét nghiệm vẫn là Examining (labOut = true);
// Prescribed = đã chốt đơn hoặc hoàn tất khám; Finished = đã thu tiền và cấp phát xong.
export const ST = { WAITING: 'Waiting', CHECKED_IN: 'CheckedIn', EXAMINING: 'Examining', PRESCRIBED: 'Prescribed', FINISHED: 'Finished', CANCELLED: 'Cancelled' }
export const STATUSES = [
  { key: ST.WAITING, label: 'Waiting' },
  { key: ST.CHECKED_IN, label: 'Checked in' },
  { key: ST.EXAMINING, label: 'In consultation' },
  { key: ST.PRESCRIBED, label: 'Awaiting payment' },
  { key: ST.FINISHED, label: 'Completed' },
  { key: ST.CANCELLED, label: 'Cancelled / left' }
]
export const statusLabel = (k) => STATUSES.find((s) => s.key === normStatus(k))?.label ?? k
// Trạng thái của bản client cũ → tên trạng thái của backend.
const LEGACY = { waiting: ST.WAITING, in_exam: ST.EXAMINING, labs: ST.EXAMINING, payment: ST.PRESCRIBED, done: ST.FINISHED, left: ST.CANCELLED }
export const normStatus = (k) => LEGACY[k] ?? k
export const inRoom = (v) => v.status === ST.EXAMINING && !v.labOut
export const atLabs = (v) => v.status === ST.EXAMINING && !!v.labOut
export const isQueued = (v) => v.status === ST.WAITING || v.status === ST.CHECKED_IN
export const LEFT_REASONS = [
  { key: 'left_exam', label: 'Left during the consultation' },
  { key: 'no_return', label: 'Did not come back from lab tests' },
  { key: 'refused', label: 'Refused examination / treatment' },
  { key: 'other', label: 'Other' }
]
export const CANCEL_REASONS = [
  { key: 'left_waiting', label: 'Left before being called' },
  { key: 'wrong_checkin', label: 'Checked in by mistake / duplicate visit' },
  { key: 'other', label: 'Other' }
]
// Lý do bỏ về của mọi nguồn (bác sĩ, quầy, chuyển tuyến) — để hiển thị.
export const ALL_LEFT_REASONS = [...LEFT_REASONS, ...CANCEL_REASONS.filter((r) => r.key !== 'other'), { key: 'referred_out', label: 'Referred to hospital (red flag)' }]
export const leftReasonLabel = (k) => ALL_LEFT_REASONS.find((r) => r.key === k)?.label ?? ''
const CLOSED = [ST.FINISHED, ST.CANCELLED]
export const isClosed = (v) => CLOSED.includes(v.status)

let state = { visits: [], redFlags: [], stale: [] }

const listeners = new Set()
function commit(next) {
  state = next
  listeners.forEach((fn) => fn())
}
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getQueue = () => state
export function useQueue() {
  return useSyncExternalStore(subscribe, getQueue)
}
const patch = (id, fields) => commit({ ...state, visits: state.visits.map((v) => (v.id === id ? { ...v, ...fields } : v)) })

// Đồng bộ với server. Chỉ Lễ tân / Bác sĩ gọi được GET /queue (Admin không có quyền).
let syncing = null
export function syncQueue() {
  // Server ghi đè mọi trường nó có (phòng, đi xét nghiệm, lời mời); chỉ giữ trường chỉ có ở máy này.
  syncing ??= fetchQueue()
    .then((list) => {
      const prev = new Map(state.visits.map((v) => [v.id, v]))
      const visits = list.map((v) => ({ ...prev.get(v.id), ...v }))
      commit({ ...state, visits, redFlags: liveRedFlags(visits, state.redFlags) })
      return true
    })
    .catch(() => false)
    .finally(() => (syncing = null))
  return syncing
}
// Lượt chờ khám còn mở từ ngày trước (GET /visits/stale, chỉ Lễ tân).
export function syncStale() {
  return fetchStale().then(
    (stale) => (commit({ ...state, stale }), true),
    () => false
  )
}
export function useQueueSync(ms = 3000) {
  useEffect(() => {
    syncQueue()
    const t = setInterval(syncQueue, ms)
    return () => clearInterval(t)
  }, [ms])
}
// Ca cờ đỏ không lưu ở máy mà lấy từ hàng chờ (lượt cấp cứu đang chờ); ca đã chuyển tuyến xem ở hồ sơ bệnh án.
// Máy chỉ giữ dấu “đã xem” của phiên này.
function liveRedFlags(visits, prev = []) {
  const old = new Map(prev.map((r) => [r.id, r]))
  return visits
    .filter((v) => isQueued(v) && v.triage === 'emergency')
    .map((v) => {
      const id = 'rf-' + v.id
      return {
        id,
        visitId: v.id,
        patientId: v.patientId,
        name: v.name,
        gender: v.gender,
        age: v.age,
        signs: v.redFlagReason || v.reason || '',
        at: v.arrivedAt,
        by: '',
        outcome: 'queued',
        ack: old.get(id)?.ack ?? false,
        doctorReview: old.get(id)?.doctorReview ?? null
      }
    })
}

// Lỗi API → { ok: false, error } (câu tiếng Việt của server).
const viaApi = (call) =>
  call.then(
    () => syncQueue().then(() => ({ ok: true })),
    (e) => ({ ok: false, error: e.message })
  )

export const isMine = (v, user) => (v.doctorId ? v.doctorId === user.id : v.doctor === user.name)

export const minutesSince = (iso, now = Date.now()) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))

// Lượt chưa đóng từ những ngày trước (GET /visits/stale, POST /visits/stale/cancel)
export const STALE_REASONS = [
  { key: 'left_waiting', label: 'Left and did not come back' },
  { key: 'no_return', label: 'Did not come back from lab tests' },
  { key: 'unpaid_left', label: 'Left without paying' },
  { key: 'other', label: 'Other' }
]
// Không xoá, chỉ đóng kèm lý do; lượt đã kê đơn mà không thu được tiền vẫn giữ đơn trong lịch sử.
export function closeStaleVisit(id, { reason, note = '' }) {
  const v = (state.stale ?? []).find((x) => x.id === id)
  if (!v) return { ok: false, error: 'Visit not found.' }
  if (!STALE_REASONS.some((r) => r.key === reason)) return { ok: false, error: 'Choose a reason.' }
  if (reason === 'other' && !note.trim()) return { ok: false, error: 'Describe what happened.' }
  const label = STALE_REASONS.find((r) => r.key === reason).label
  return apiCancelStale([id], [VI[label] ?? label, note.trim()].filter(Boolean).join(' — ')).then(
    () => syncStale().then(() => ({ ok: true })),
    (e) => ({ ok: false, error: e.message })
  )
}

// Thứ tự gọi khám: cấp cứu → ưu tiên → số thứ tự; người vắng mặt xuống cuối.
// readyOrder chỉ gồm người đã check-in — bác sĩ chỉ nhận được nhóm này.
const rank = (v) => (v.triage === 'emergency' ? 2 : v.priority ? 1 : 0)
const byQueue = (a, b) => a.absent - b.absent || rank(b) - rank(a) || a.ticket - b.ticket
export const waitingOrder = (visits = state.visits) => visits.filter(isQueued).sort(byQueue)
export const readyOrder = (visits = state.visits) => visits.filter((v) => v.status === ST.CHECKED_IN).sort(byQueue)

export function checkInVisit(id) {
  return viaApi(apiCheckIn(id))
}

// Phòng khám
export const inRoomOf = (user, visits = state.visits) => visits.filter((v) => inRoom(v) && isMine(v, user))

// Nhận bệnh nhân vào phòng hoặc khám tiếp sau xét nghiệm. Mỗi lúc chỉ khám một người — phải chốt đơn hoặc cho đi
// xét nghiệm người đang khám trước (tránh bỏ quên); ca ưu tiên được vượt khi bác sĩ xác nhận (force) và có ghi nhật ký.
// Bị chặn → trả { busy, target } để giao diện hỏi lại. Server kiểm tra lại trong cùng giao dịch (409 VISIT_TAKEN).
export function takePatient(id, user, { force = false } = {}) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || ![ST.CHECKED_IN, ST.EXAMINING, ST.WAITING].includes(v.status)) return { ok: false, error: 'This patient is not waiting for consultation.' }
  // Backend chặn start-exam khi chưa check-in (INVALID_TRANSITION).
  if (v.status === ST.WAITING) return { ok: false, error: 'This patient has not been checked in yet — ask reception to check them in when they are at the desk.' }
  // Bệnh nhân của bác sĩ khác: bác sĩ đó phải trả về hàng chờ thì người khác mới nhận được (409 VISIT_TAKEN).
  const other = v.status === ST.EXAMINING && v.doctor && !isMine(v, user)
  if (other) return { ok: false, error: v.labOut ? 'This patient is out for lab tests under another doctor.' : 'Another doctor is already seeing this patient.' }
  const resume = atLabs(v)
  const reopen = inRoom(v)
  const busy = inRoomOf(user).filter((x) => x.id !== id)
  if (busy.length && !(force && v.priority))
    return { ok: false, busy: busy[0], target: v, error: 'Finish the patient in your room first — finalize the visit or send them for lab tests.' }
  // Server quyết định ai nhận được; phòng lấy từ GET /queue.
  if (reopen) return { ok: true, visit: v }
  if (resume)
    // Lượt vẫn Examining của bác sĩ này → báo lab-return, không gọi start-exam (409 INVALID_TRANSITION).
    // Chờ server trả lời rồi mới báo thành công; bị từ chối thì bệnh nhân vẫn ở nhóm đi xét nghiệm.
    return apiLabReturn(id).then(
      async () => {
        await syncQueue()
        patch(id, { resumedFromLabs: true, entered: true })
        return { ok: true, visit: state.visits.find((x) => x.id === id) }
      },
      (e) => (syncQueue(), { ok: false, error: e.message })
    )
  return apiStartExam(id).then(
    async () => {
      await syncQueue()
      patch(id, { calledAt: new Date().toISOString() })
      return { ok: true, visit: state.visits.find((x) => x.id === id) ?? v }
    },
    (e) => (syncQueue(), { ok: false, error: e.message })
  )
}

// Mời vào phòng qua server (ERD v2.0): POST /queue/call-next chọn người kế và đóng dấu called_at; máy quầy thấy lời mời
// qua GET /queue. Bệnh nhân vào phòng thì bác sĩ bấm Bắt đầu khám. Mỗi bác sĩ chỉ mời một người một lúc (409 ACTIVE_CALL).
const CALL_ERRORS = {
  ACTIVE_CALL: 'You are already calling a patient who has not come in yet — start the exam or mark them not here first.',
  QUEUE_EMPTY: 'No one is waiting.',
  CALLED_BY_OTHER: 'Another doctor is calling this patient.',
  NOT_CALLED: 'This patient is not being called.'
}
const callError = (e) => CALL_ERRORS[e?.code] ?? e?.message ?? 'Could not call the patient.'
// Đang được mời: còn trong hàng chờ, chưa bác sĩ nào nhận, có called_at.
export const isInvited = (v) => isQueued(v) && !!v.calledAt && !v.doctorId
export const myInvite = (user, visits = state.visits) => visits.find((v) => isInvited(v) && v.calledById === user.id) ?? null
export const invitesOf = (visits = state.visits) => visits.filter(isInvited).sort((a, b) => new Date(a.calledAt) - new Date(b.calledAt))
const viaCall = (call) =>
  call.then(
    async (r) => {
      await syncQueue()
      return { ok: true, invited: state.visits.find((x) => x.id === r?.visit_id) ?? null }
    },
    (e) => (syncQueue(), { ok: false, code: e?.code, error: callError(e) })
  )
export function inviteNext() {
  return viaCall(apiCallNext())
}
export function inviteAgain(id) {
  return viaCall(apiCallVisit(id))
}
// Bỏ lời mời, lượt về lại hàng chờ như cũ.
export const dropInvite = (id) => viaCall(apiCancelCall(id))

// Server chọn người kế; bác sĩ bắt đầu khám khi bệnh nhân vào phòng.
export function takeNext(user) {
  const busy = inRoomOf(user)
  if (busy.length) return { ok: false, busy: busy[0], target: { ...busy[0], priority: false }, error: 'Finish the patient in your room first — finalize the visit or send them for lab tests.' }
  return inviteNext()
}
// Thu hồi đơn vừa chốt để sửa. rx là một dòng của GET /prescriptions (fromServerRx): GET /queue không có lượt Prescribed
// nên kiểm theo dòng đơn. Server kiểm lại, hoàn kho, huỷ đơn và hoá đơn chờ thu, đưa lượt về Examining.
// Đơn đã thu tiền / đã cấp thuốc là chứng từ: không sửa, kê đơn mới ở lần khám sau.
export const canRecall = (rx, user) => rx.doctorId === user.id && rx.status === 'Confirmed' && rx.pay !== 'paid' && rx.rx.every((x) => x.dispense === 'Pending')
export function recallVisit(rx, user) {
  if (rx.doctorId !== user.id) return { ok: false, error: 'Only the prescribing doctor can recall this prescription.' }
  if (rx.status !== 'Confirmed' || rx.pay === 'paid') return { ok: false, error: 'Only prescriptions still awaiting payment can be recalled.' }
  if (!canRecall(rx, user)) return { ok: false, error: 'Some drugs have already been dispensed — the prescription can no longer be reopened.' }
  if (inRoomOf(user).length) return { ok: false, error: 'Finish the patient in your room first — finalize the visit or send them for lab tests.' }
  return apiReopen(rx.visitId, 'Bác sĩ thu hồi đơn để sửa').then(
    async () => (await syncQueue(), { ok: true }),
    (e) => ({ ok: false, error: e.message })
  )
}
export const labOrderSummary = (o) => [...(o.packageName ? [o.packageName] : []), ...o.tests.filter((x) => !x.cancelled && !x.inPackage).map((x) => x.name), ...(o.other ? [o.other] : [])].join(', ')
// key = "<mã phiếu>:<mã xét nghiệm>" ("other" = xét nghiệm ngoài danh mục). Phiếu từ server: mã là item_id.
export const labRows = (o) => [
  ...o.tests.map((x) => ({ key: o.id + ':' + x.code, name: x.name, result: x.result ?? '', itemId: x.itemId, cancelled: !!x.cancelled, ref: x.ref ?? '' })),
  ...(o.other ? [{ key: o.id + ':other', name: o.other, result: o.otherResult ?? '' }] : [])
]

// Bệnh nhân bỏ về / không quay lại / từ chối khám: bác sĩ đóng lượt, không lập hoá đơn, bắt buộc lý do; ghi chép đã viết
// được lưu kèm. Muốn thu phí khám thì hoàn tất khám không kê thuốc.
export function leaveVisit(id, { reason, note = '' }, user) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || v.status !== ST.EXAMINING || !isMine(v, user)) return { ok: false, error: 'Only your own patients in consultation or out for lab tests can be closed.' }
  if (!LEFT_REASONS.some((r) => r.key === reason)) return { ok: false, error: 'Choose a reason.' }
  if (reason === 'other' && !note.trim()) return { ok: false, error: 'Describe what happened.' }
  const label = LEFT_REASONS.find((r) => r.key === reason).label
  return viaApi(apiCancelVisit(id, [VI[label] ?? label, note.trim()].filter(Boolean).join(' — ')))
}

// Quầy huỷ lượt còn chờ khám (về trước khi được gọi, tiếp đón nhầm / trùng). Không xoá — lượt sang Cancelled kèm lý do.
export function cancelVisit(id, { reason, note = '' }) {
  if (!CANCEL_REASONS.some((r) => r.key === reason)) return Promise.resolve({ ok: false, error: 'Choose a reason.' })
  if (reason === 'other' && !note.trim()) return Promise.resolve({ ok: false, error: 'Describe what happened.' })
  const label = CANCEL_REASONS.find((r) => r.key === reason).label
  // Server lưu nguyên văn lý do vào nhật ký → ghi tiếng Việt.
  return viaApi(apiCancelVisit(id, [VI[label] ?? label, note.trim()].filter(Boolean).join(' — ')))
}

// Trả về hàng chờ (VD bác sĩ phải rời phòng): bác sĩ nào cũng nhận lại được; phiếu dở đi kèm để người sau đọc tiếp.
export function releaseVisit(id, user) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || v.status !== ST.EXAMINING || !isMine(v, user)) return { ok: false, error: 'Only your own patients in consultation can be returned to the queue.' }
  return viaApi(apiRelease(id))
}

// Chỉ ghi “đã xem” ở máy này; chuyển tuyến đi qua giấy chuyển tuyến gửi server.
export function reviewRedFlag(id, decision, user) {
  const rf = state.redFlags.find((r) => r.id === id)
  if (!rf) return { ok: false, error: 'Case not found.' }
  const doctorReview = { by: user.name, byId: user.id, at: new Date().toISOString(), decision }
  commit({ ...state, redFlags: state.redFlags.map((r) => (r.id === id ? { ...r, doctorReview } : r)) })
  return { ok: true }
}

export function acknowledgeRedFlag(id) {
  commit({ ...state, redFlags: state.redFlags.map((r) => (r.id === id ? { ...r, ack: true } : r)) })
}
