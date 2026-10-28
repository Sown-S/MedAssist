// ĐÂY LÀ LỚP GIẢ LẬP (demo) cho hàng chờ trong ngày (bảng visits) và các ca cờ đỏ (bảng red_flag_referrals).
// Lưu theo NGÀY: mở lại app trong ngày vẫn còn hàng chờ; sang ngày mới thì tạo hàng chờ mẫu mới,
// giờ đến / giờ đổi trạng thái tính lùi từ lúc mở app để dữ liệu mẫu luôn khớp "hôm nay".
// Số thứ tự: nhập theo phiếu bệnh nhân bốc ở máy lấy số bên ngoài, hoặc để trống cho hệ thống cấp.
// Khi tắt giả lập (DEMO_MODE = false): danh sách lượt khám lấy từ GET /queue (useQueueSync), check-in và huỷ lượt
// gọi API thật; không tạo dữ liệu mẫu, không lưu localStorage. Các phần chưa có API vẫn chạy cục bộ.
import { useEffect, useSyncExternalStore } from 'react'
import { DEMO_MODE } from './client'
import { fetchQueue, checkIn as apiCheckIn, cancelVisit as apiCancelVisit, startExam as apiStartExam, releaseVisit as apiRelease } from './clinicApi'
import { reopenPrescription as apiReopen } from './examApi'
import { VI } from '../i18n/vi'
import { getSettings } from './settingsStore'
import { logEvent } from './activityStore'
import { getPatients, ageOf, updatePatientClinical } from './patientStore'
import { RX, archiveVisits } from './rxHistory'
import { archiveDay } from './visitArchive'
import { staleDraft } from './draftStore'
import { normalizeVitals } from './vitals'
import { getInvoices, issueInvoice, payInvoice, setInvoiceMethod, replaceInvoiceItems, cancelInvoice, sampleItems, invoiceById, activeInvoiceOf, itemType, dayOf } from './invoiceStore'
import { getInventory, findDrugByName, deductForCourse, restoreAllocations } from './inventoryStore'
import { soldOutside } from './rxSafety'

const KEY = 'medassist_queue_v2'

// Trạng thái lượt khám — ĐÚNG máy trạng thái của backend v5 (VISIT.status):
//   Waiting → CheckedIn → Examining → Prescribed → Finished, và Cancelled (huỷ / bỏ về / chuyển tuyến).
//  - Waiting   : đã tiếp đón (POST /visits), đang ngồi chờ;
//  - CheckedIn : tới lượt, lễ tân xác nhận có mặt (PATCH /visits/{id}/check-in) — bác sĩ chỉ nhận được người ở trạng thái này;
//  - Examining : bác sĩ đã nhận khám (PATCH …/start-exam, giữ lượt — bác sĩ khác bị 409 VISIT_TAKEN).
//                Đi xét nghiệm (phiếu chỉ định giấy) vẫn là Examining, đánh dấu labOut = true;
//  - Prescribed: bác sĩ đã chốt đơn (…/prescription/confirm) hoặc "Hoàn tất khám" không kê đơn (…/complete-exam);
//  - Finished  : đã thu tiền (và cấp phát xong);
//  - Cancelled : huỷ lượt / bệnh nhân bỏ về / chuyển tuyến cờ đỏ (kèm lý do ở visit.left).
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
// Dữ liệu lưu từ bản cũ của client (waiting / in_exam / labs / payment / done / left) → tên trạng thái của backend.
const LEGACY = { waiting: ST.WAITING, in_exam: ST.EXAMINING, labs: ST.EXAMINING, payment: ST.PRESCRIBED, done: ST.FINISHED, left: ST.CANCELLED }
export const normStatus = (k) => LEGACY[k] ?? k
export const migrateVisit = (v) => (LEGACY[v.status] ? { ...v, status: LEGACY[v.status], ...(v.status === 'labs' ? { labOut: true } : {}) } : v)
// Đang ở trong phòng khám của bác sĩ (Examining, không đi xét nghiệm) / đang đi xét nghiệm.
export const inRoom = (v) => v.status === ST.EXAMINING && !v.labOut
export const atLabs = (v) => v.status === ST.EXAMINING && !!v.labOut
// Còn chờ khám (chưa bác sĩ nào nhận).
export const isQueued = (v) => v.status === ST.WAITING || v.status === ST.CHECKED_IN
export const LEFT_REASONS = [
  { key: 'left_exam', label: 'Left during the consultation' },
  { key: 'no_return', label: 'Did not come back from lab tests' },
  { key: 'refused', label: 'Refused examination / treatment' },
  { key: 'other', label: 'Other' }
]
// Quầy huỷ lượt đang CHỜ khám (bệnh nhân về trước khi được gọi / tiếp đón nhầm, trùng lượt).
export const CANCEL_REASONS = [
  { key: 'left_waiting', label: 'Left before being called' },
  { key: 'wrong_checkin', label: 'Checked in by mistake / duplicate visit' },
  { key: 'other', label: 'Other' }
]
// Lý do "bỏ về" của mọi nguồn (bác sĩ, quầy, ca cờ đỏ chuyển tuyến) — để hiển thị.
export const ALL_LEFT_REASONS = [...LEFT_REASONS, ...CANCEL_REASONS.filter((r) => r.key !== 'other'), { key: 'referred_out', label: 'Referred to hospital (red flag)' }]
export const leftReasonLabel = (k) => ALL_LEFT_REASONS.find((r) => r.key === k)?.label ?? ''
const CLOSED = [ST.FINISHED, ST.CANCELLED]
export const isClosed = (v) => CLOSED.includes(v.status)

const ago = (min) => new Date(Date.now() - min * 60000).toISOString()
const today = () => dayOf(new Date().toISOString())

// [chỉ số bệnh nhân trong danh bạ, lý do khám, mạch·HA, nhiệt độ, ưu tiên, trạng thái, đến cách đây (phút), vào trạng thái hiện tại (phút), bác sĩ, đơn thuốc, hình thức đã thu]
const SEED = [
  [0, 'Acute pharyngitis', '76 · 118/76', '37.8°C', false, 'Finished', 150, 95, 'Trần Minh', 'throat', 'cash'],
  [1, 'Tonsillitis', '72 · 120/80', '37.4°C', false, 'Finished', 135, 70, 'Nguyễn Văn Dũng', 'throat', 'transfer'],
  [2, 'General check-up', '78 · 125/80', '36.8°C', false, 'Finished', 120, 40, 'Trần Minh', null, 'cash'],
  [3, 'Gastric pain', '80 · 130/85', '36.9°C', false, 'Prescribed', 95, 6, 'Nguyễn Văn Dũng', 'gastric', null],
  [4, 'Fever, productive cough', '88 · 128/82', '38.6°C', true, 'labs', 80, 18, 'Trần Minh', null, null],
  [5, 'Chest tightness on exertion', '84 · 145/92', '37.0°C', false, 'Prescribed', 70, 3, 'Trần Minh', 'diabetes', null],
  [6, 'Fever 39.2°C', '110 · 100/64', '39.2°C', true, 'Examining', 42, 9, 'Trần Minh', null, null],
  [7, 'Sore throat', '76 · 118/76', '37.2°C', false, 'Examining', 38, 4, 'Nguyễn Văn Dũng', null, null],
  [8, 'Dizziness, headache', '82 · 150/90', '36.7°C', true, 'CheckedIn', 26, 26, '', null, null],
  [9, 'Itchy rash on both arms', '74 · 115/72', '36.8°C', false, 'CheckedIn', 19, 19, '', null, null],
  [10, 'Cough for 5 days', '80 · 112/70', '37.5°C', false, 'Waiting', 11, 11, '', null, null],
  [11, 'Lower back pain', '78 · 128/84', '36.6°C', false, 'Waiting', 4, 4, '', null, null]
]

// Phiếu chỉ định mẫu cho lượt đang đi xét nghiệm trong dữ liệu mẫu.
const SAMPLE_LAB_ORDER = (by, at) => ({
  id: 'cd-sample',
  tests: [
    { code: 'XN01', name: 'Công thức máu (CBC) — Bạch cầu (WBC)', group: 'hematology', sample: 'blood' },
    { code: 'XN10', name: 'CRP', group: 'immunology', sample: 'blood' },
    { code: 'XN14', name: 'X-quang ngực thẳng', group: 'imaging', sample: 'none' }
  ],
  other: '',
  diagnosis: 'Viêm phế quản cấp? — theo dõi viêm phổi',
  note: '',
  at,
  by
})

// Ảnh chụp thông tin bệnh nhân lúc tiếp đón (để thẻ hàng chờ không phải tra lại danh bạ).
const snapshot = (p) => ({ patientId: p.id, name: p.name, phone: p.phone, gender: p.gender, age: ageOf(p.dob), allergies: p.allergies, history: p.history, payer: p.payer ?? 'fee', insuranceNo: p.insuranceNo ?? '' })

function seed() {
  const start = getSettings().numbering.queueStart || 1
  const dir = getPatients()
  const visits = SEED.map(([pi, reason, pulseBp, temp, priority, status, arrived, since, doctor, rx, paidBy], i) => ({
    id: 'q' + Date.now() + '-' + i,
    ticket: start + i,
    ...snapshot(dir[pi] ?? dir[0]),
    reason,
    vitals: normalizeVitals({ pulseBp, temp }),
    symptoms: [],
    priority,
    status: status === 'labs' ? ST.EXAMINING : status,
    labOut: status === 'labs',
    checkedInAt: ['Waiting'].includes(status) ? null : ago(Math.max(1, since - 2)),
    arrivedAt: ago(arrived),
    statusAt: ago(since),
    doctor,
    // Dòng đơn mẫu: lượt đã xong = đã cấp; lượt chờ thanh toán = chờ cấp (dữ liệu mẫu không trừ kho lại mỗi ngày).
    rx: rx ? RX[rx].map((l) => ({ ...l, dispense_status: status === 'Finished' ? 'Dispensed' : 'Pending', alloc: [] })) : [],
    rxAt: rx ? ago(since + 5) : null,
    invoiceId: null,
    calledAt: null,
    absent: false,
    labOrders: status === 'labs' ? [SAMPLE_LAB_ORDER(doctor, ago(since))] : [],
    _paid: paidBy,
    _rxKind: rx
  }))
  // Lượt đã khám xong trong dữ liệu mẫu → có hoá đơn đã thu; lượt chờ thanh toán → hoá đơn pending tự tạo.
  for (const v of visits) {
    if (v._paid) {
      const items = sampleItems(v._rxKind)
      v.invoiceId = issueInvoice(v, { items, method: v._paid, status: 'paid', createdAt: v.statusAt }, null).id
    } else if (v.status === ST.PRESCRIBED) v.invoiceId = issueInvoice(v, { items: invoiceLinesOf(v), status: 'pending', createdAt: v.statusAt }, null).id
    delete v._paid
    delete v._rxKind
  }
  const sonIdx = dir.findIndex((p) => p.name === 'Trịnh Văn Sơn')
  const redFlags = [
    {
      id: 'rf1',
      ...(sonIdx >= 0 ? snapshot(dir[sonIdx]) : { name: 'Trịnh Văn Sơn' }),
      signs: 'Crushing chest pain radiating to the left arm, sweating',
      at: ago(64),
      by: 'Nguyễn Thị Mai',
      outcome: 'referred',
      ack: true,
      doctorReview: { by: 'Trần Minh', byId: null, at: ago(60), decision: 'referred' }
    }
  ]
  return { day: today(), visits, redFlags, calling: null, calls: [], stale: [] }
}

// Sang ngày mới: lưu đơn thuốc + mọi lượt khám của ngày cũ, rồi tạo hàng chờ mới.
// Lượt CHƯA ĐÓNG (chưa khám xong, chưa thu tiền) KHÔNG tự đóng và KHÔNG tự chuyển vào hàng chờ hôm nay — giống backend
// (GET /visits/stale): chúng nằm ở danh sách "lượt chưa đóng" (state.stale) để Lễ tân xử lý đầu ngày: đóng lượt kèm lý do,
// hoặc thu nốt tiền khi bệnh nhân quay lại trả. Bệnh nhân còn lượt chưa đóng thì chưa tiếp đón lượt mới được.
function rollOver(s) {
  archiveVisits(s.visits, s.day)
  // Lượt chưa khám xong còn phiếu dở → lưu kèm (draftNotes) để ghi chép lâm sàng không mất theo ngày.
  archiveDay(
    s.visits.map((v) => (v.status !== ST.PRESCRIBED && v.status !== ST.FINISHED && staleDraft(v.id) ? { ...v, draftNotes: staleDraft(v.id) } : v)),
    s.day
  )
  const open = s.visits.filter((v) => !CLOSED.includes(v.status)).map((v) => ({ ...v, carriedFrom: v.carriedFrom ?? s.day }))
  if (open.length)
    logEvent(null, 'queue.day_closed', {
      target: { kind: 'queue', id: s.day },
      params: { day: s.day, left: open.map((v) => v.name).join(', '), carried: open.filter((v) => v.status === ST.PRESCRIBED).length },
      level: 'warning'
    })
  return open
}
function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    const s = raw?.visits ? { ...raw, visits: raw.visits.map(migrateVisit), stale: (raw.stale ?? []).map(migrateVisit) } : raw
    if (s?.day === today()) return s
    if (s?.visits) {
      const fresh = seed()
      return { ...fresh, stale: [...(s.stale ?? []), ...rollOver(s)] }
    }
    return null
  } catch {
    return null
  }
}
let state = DEMO_MODE ? read() ?? seed() : { day: today(), visits: [], redFlags: [], calling: null, calls: [], stale: [] }

// Backend thật: server chưa lưu việc đi xét nghiệm (phiếu chỉ định giấy, lượt vẫn Examining) — giữ các trường này ở máy
// bác sĩ (localStorage, trong ngày) để tải lại / mở lại app không mất bệnh nhân đang đi xét nghiệm và phiếu chỉ định.
const LAB_KEY = 'medassist_lab_local_v1'
const LAB_FIELDS = ['labOut', 'labOrders', 'labReturnedAt', 'resumedFromLabs']
function readLabLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(LAB_KEY))
    return s?.day === today() ? s.byId : {}
  } catch {
    return {}
  }
}
let labLocal = DEMO_MODE ? {} : readLabLocal()
function saveLabLocal(visits) {
  const byId = { ...labLocal }
  for (const v of visits) {
    const f = Object.fromEntries(LAB_FIELDS.filter((k) => v[k] && !(Array.isArray(v[k]) && !v[k].length)).map((k) => [k, v[k]]))
    if (Object.keys(f).length) byId[v.id] = { ...f, doctorId: v.doctorId }
    else delete byId[v.id]
  }
  labLocal = byId
  try {
    localStorage.setItem(LAB_KEY, JSON.stringify({ day: today(), byId }))
  } catch {
    /* chỉ giữ trong phiên */
  }
}

const listeners = new Set()
function commit(next) {
  state = next
  try {
    if (DEMO_MODE) localStorage.setItem(KEY, JSON.stringify(state))
    else saveLabLocal(state.visits)
  } catch {
    /* chỉ giữ trong phiên */
  }
  listeners.forEach((fn) => fn())
}
commit(state)
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getQueue = () => state
export function useQueue() {
  return useSyncExternalStore(subscribe, getQueue)
}
const patch = (id, fields) => commit({ ...state, visits: state.visits.map((v) => (v.id === id ? { ...v, ...fields } : v)) })

// ---------- Đồng bộ với server (chỉ khi tắt giả lập) ----------
// Gọi ở màn Lễ tân / Bác sĩ (quyền đọc hàng đợi); Admin không gọi được GET /queue.
let syncing = null
export function syncQueue() {
  if (DEMO_MODE) return Promise.resolve(true)
  // Giữ các trường chỉ có ở máy này (giờ mời, đang đi xét nghiệm...) — server ghi đè phần còn lại (cả phòng khám).
  syncing ??= fetchQueue()
    .then((list) => {
      const prev = new Map(state.visits.map((v) => [v.id, v]))
      const visits = list.map((v) => {
        const local = prev.get(v.id) ?? labLocal[v.id]
        const m = { ...labLocal[v.id], ...prev.get(v.id), ...v }
        // Cờ đi xét nghiệm chỉ còn đúng khi lượt vẫn Examining với CÙNG bác sĩ. Đã trả về hàng chờ, chốt đơn, huỷ,
        // hay bác sĩ khác nhận (máy khác) → bỏ cờ cũ, nếu không bệnh nhân bị kẹt ở nhóm "Đang đi xét nghiệm".
        const sameExam = v.status === ST.EXAMINING && (!local?.doctorId || local.doctorId === v.doctorId)
        return sameExam ? m : { ...m, labOut: false, resumedFromLabs: false, labReturnedAt: null }
      })
      commit({ ...state, visits })
      return true
    })
    .catch(() => false)
    .finally(() => (syncing = null))
  return syncing
}
export function useQueueSync(ms = 3000) {
  useEffect(() => {
    if (DEMO_MODE) return
    syncQueue()
    const t = setInterval(syncQueue, ms)
    return () => clearInterval(t)
  }, [ms])
}
// Lỗi API → { ok: false, error } như các hàm giả lập (câu tiếng Việt của server).
const viaApi = (call) =>
  call.then(
    () => syncQueue().then(() => ({ ok: true })),
    (e) => ({ ok: false, error: e.message })
  )

// Lượt khám / đơn thuốc này có phải của bác sĩ đang đăng nhập không — so theo ID tài khoản (đổi họ tên hay trùng tên
// vẫn đúng); dữ liệu cũ chưa có doctorId thì so theo họ tên như trước.
export const isMine = (v, user) => (v.doctorId ? v.doctorId === user.id : v.doctor === user.name)

// Số phút từ một mốc ISO tới bây giờ.
export const minutesSince = (iso, now = Date.now()) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))

// Bệnh nhân đang có lượt chưa hoàn tất hôm nay (để không cấp số hai lần).
export const activeVisitOf = (patientId) => state.visits.find((v) => v.patientId === patientId && !CLOSED.includes(v.status))
// Lượt chưa đóng từ những ngày trước của bệnh nhân (backend trả PATIENT_HAS_OPEN_VISIT nếu tiếp đón khi còn lượt này).
export const staleVisitOf = (patientId) => (state.stale ?? []).find((v) => v.patientId === patientId)

// ---------- Lượt chưa đóng từ những ngày trước (backend: GET /visits/stale, POST /visits/stale/cancel) ----------
export const STALE_REASONS = [
  { key: 'left_waiting', label: 'Left and did not come back' },
  { key: 'no_return', label: 'Did not come back from lab tests' },
  { key: 'unpaid_left', label: 'Left without paying' },
  { key: 'other', label: 'Other' }
]
// Đóng lượt cũ kèm lý do (không xoá — ghi nhật ký). Lượt đã kê đơn mà không thu được tiền vẫn giữ đơn trong lịch sử.
export function closeStaleVisit(id, { reason, note = '' }, user) {
  const v = (state.stale ?? []).find((x) => x.id === id)
  if (!v) return { ok: false, error: 'Visit not found.' }
  if (!STALE_REASONS.some((r) => r.key === reason)) return { ok: false, error: 'Choose a reason.' }
  if (reason === 'other' && !note.trim()) return { ok: false, error: 'Describe what happened.' }
  commit({ ...state, stale: state.stale.filter((x) => x.id !== id) })
  logEvent(user, 'visit.cancel', {
    target: { kind: 'patient', id: v.patientId, label: v.name },
    params: { patient: v.name, ticket: v.ticket, reason, note: (note.trim() ? note.trim() + ' · ' : '') + 'from ' + v.carriedFrom },
    level: 'warning'
  })
  return { ok: true }
}
// Bệnh nhân quay lại trả tiền cho lượt đã kê đơn: đưa lượt vào hàng chờ hôm nay ở bước Chờ thanh toán (giữ số cũ).
export function reopenStaleForPayment(id, user) {
  const v = (state.stale ?? []).find((x) => x.id === id)
  if (!v) return { ok: false, error: 'Visit not found.' }
  if (v.status !== ST.PRESCRIBED) return { ok: false, error: 'Only visits waiting for payment can be collected — close the others.' }
  commit({ ...state, stale: state.stale.filter((x) => x.id !== id), visits: [...state.visits, v] })
  logEvent(user, 'visit.update', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name, ticket: v.ticket } })
  return { ok: true, visit: v }
}

// Thứ tự gọi khám (GET /queue): Cấp cứu (cờ đỏ chưa chuyển viện) → ưu tiên → theo số thứ tự; người vắng mặt xuống cuối.
// waitingOrder: mọi lượt còn chờ (Waiting + CheckedIn); readyOrder: chỉ người ĐÃ CHECK-IN — bác sĩ chỉ nhận được nhóm này.
const rank = (v) => (v.triage === 'emergency' ? 2 : v.priority ? 1 : 0)
const byQueue = (a, b) => a.absent - b.absent || rank(b) - rank(a) || a.ticket - b.ticket
export const waitingOrder = (visits = state.visits) => visits.filter(isQueued).sort(byQueue)
export const readyOrder = (visits = state.visits) => visits.filter((v) => v.status === ST.CHECKED_IN).sort(byQueue)

// Lễ tân: tới lượt, bệnh nhân có mặt ở quầy → check-in (backend: PATCH /visits/{id}/check-in, Waiting → CheckedIn).
export function checkInVisit(id, user) {
  if (!DEMO_MODE) return viaApi(apiCheckIn(id))
  const v = state.visits.find((x) => x.id === id)
  if (!v || v.status !== ST.WAITING) return { ok: false, error: 'Only waiting visits can be checked in.' }
  const at = new Date().toISOString()
  patch(id, { status: ST.CHECKED_IN, statusAt: at, checkedInAt: at, absent: false })
  logEvent(user, 'queue.checked_in', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name, ticket: v.ticket } })
  return { ok: true }
}

// Số thứ tự kế tiếp khi hệ thống tự cấp.
// Lượt chuyển từ ngày trước (carriedFrom) giữ số cũ — không tính vào số của hôm nay.
const todays = () => state.visits.filter((v) => !v.carriedFrom)
export const nextTicket = () => {
  const t = todays().map((v) => v.ticket)
  return t.length ? Math.max(...t) + 1 : getSettings().numbering.queueStart || 1
}
export const ticketTaken = (n) => todays().some((v) => v.ticket === n)

// Tiếp đón (backend: POST /api/v1/visits): đưa bệnh nhân vào hàng "Chờ khám" với số thứ tự hệ thống cấp.
//  - vitals: 8 khoá chuẩn, dạng số (api/vitals.js) — ô không đo thì không có khoá;
//  - symptoms: CHỈ triệu chứng lễ tân đã xác nhận [{ symptom_code, state: PRESENT|ABSENT, source: Form|Extracted|Prompt }];
//  - reason: lời kể / lý do khám (văn bản tự do) — chỉ để hiển thị, KHÔNG đưa thẳng vào luật / AI;
//  - days: thời gian có triệu chứng (ngày), nếu hỏi được.
export function createVisit(patient, { reason, symptoms = [], days = null, vitals = {}, pregnancy = '', priority, triage = 'routine', triageRules = [], ticket, payer, insuranceNo }, user) {
  const n = ticket ? Number(ticket) : nextTicket()
  if (!Number.isInteger(n) || n < 1) return { ok: false, error: 'Enter a valid queue number.' }
  if (ticketTaken(n)) return { ok: false, error: 'This queue number is already used today.' }
  const now = new Date().toISOString()
  const visit = {
    id: 'q' + Date.now(),
    ticket: n,
    ...snapshot(patient),
    reason: reason.trim() || '—',
    symptoms: symptoms.map((x) => ({ ...x, confirmed_by: user.id, confirmed_at: new Date().toISOString() })),
    days: days === '' || days == null ? null : Number(days),
    vitals,
    // Tình trạng mang thai lúc khám: 'yes' | 'no' | '' (không hỏi / không áp dụng) — hiện ở khung nhắc khi kê đơn.
    pregnancy,
    // Mức phân loại lúc tiếp đón (Architecture 5.1.3): 'emergency' (luật cờ đỏ) | 'high' (luật ưu tiên / lễ tân nâng) | 'routine'.
    triage,
    triageRules,
    payer: payer ?? patient.payer ?? 'fee',
    insuranceNo: (insuranceNo ?? patient.insuranceNo ?? '').trim().toUpperCase(),
    priority,
    status: ST.WAITING,
    checkedInAt: null,
    arrivedAt: now,
    statusAt: now,
    doctor: '',
    rx: [],
    rxAt: null,
    invoiceId: null,
    calledAt: null,
    absent: false
  }
  commit({ ...state, visits: [...state.visits, visit] })
  logEvent(user, 'queue.visit_created', { target: { kind: 'patient', id: patient.id, label: patient.name }, params: { patient: patient.name, ticket: n, priority } })
  return { ok: true, visit }
}

// ---------- Gọi bệnh nhân (bác sĩ báo sẵn sàng, Lễ tân gọi miệng) ----------
// Bác sĩ khám xong và bấm "Mời bệnh nhân tiếp theo" → người kế tiếp (ưu tiên trước, rồi theo số) được gán vào phòng
// của bác sĩ và phát một SỰ KIỆN GỌI (calls). Máy quầy báo "ding", hiện số + phòng; lễ tân gọi miệng rồi bấm "Đã vào phòng"
// (≈ check-in của backend) hoặc "Không có mặt". 2–3 bác sĩ khám tổng quát nên bệnh nhân tự xen kẽ vào phòng nào trống trước.
// Backend thật: PATCH /visits/{id}/check-in khi lễ tân xác nhận đã vào; tín hiệu "bác sĩ sẵn sàng" cần Sơn bổ sung.
const MAX_CALLS = 30
function pushCall(s, v, user, kind) {
  const call = { id: 'c' + Date.now() + Math.random().toString(36).slice(2, 5), visitId: v.id, ticket: v.ticket, name: v.name, room: v.room ?? '', doctor: user?.name ?? v.doctor, kind, at: new Date().toISOString() }
  return { ...s, calling: v.id, calls: [call, ...(s.calls ?? [])].slice(0, MAX_CALLS) }
}
// Gọi lại (bệnh nhân chưa vào / chưa nghe rõ) — bác sĩ hoặc quầy đều bấm được.
export function recallPatient(id, user) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || v.status !== ST.EXAMINING || v.entered !== false) return { ok: false, error: 'This patient is not being called.' }
  commit(pushCall(state, v, user, 'recall'))
  return { ok: true, visit: v }
}
// Bệnh nhân đã vào phòng → hết trạng thái "đang mời" (tự động khi bác sĩ bắt đầu ghi phiếu khám).
export function confirmEntered(id) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || v.status !== ST.EXAMINING || v.entered !== false) return
  commit({ ...state, calling: state.calling === id ? null : state.calling, visits: state.visits.map((x) => (x.id === id ? { ...x, entered: true } : x)) })
}
// Gọi mà không thấy bệnh nhân vào (backend: PATCH /visits/{id}/release): trả về CUỐI nhóm đã check-in (giữ số, đánh dấu vắng mặt),
// phòng trống lại để mời người tiếp theo. Bệnh nhân gọi lại từ "đi xét nghiệm" thì quay về đúng nhóm đó.
export function markNotPresent(id, user) {
  const v = state.visits.find((x) => x.id === id)
  // Bác sĩ của phòng, hoặc Lễ tân ở quầy (người trực tiếp gọi bệnh nhân) đều báo được.
  if (!v || v.status !== ST.EXAMINING || v.entered !== false || !(isMine(v, user) || user?.roleKey === 'reception')) return { ok: false, error: 'This patient is not being called.' }
  const backToLabs = !!v.resumedFromLabs
  commit({
    ...state,
    calling: state.calling === id ? null : state.calling,
    visits: state.visits.map((x) =>
      x.id === id ? (backToLabs ? { ...x, labOut: true, entered: true } : { ...x, status: ST.CHECKED_IN, absent: true, doctor: '', doctorId: null, room: '' }) : x
    )
  })
  logEvent(user, 'queue.not_present', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name, ticket: v.ticket } })
  return { ok: true }
}

// ---------- Phòng khám (bác sĩ) ----------
// Bệnh nhân đang ở trong phòng của bác sĩ này (đang khám, chưa chốt đơn / chưa chuyển đi xét nghiệm).
export const inRoomOf = (user, visits = state.visits) => visits.filter((v) => inRoom(v) && isMine(v, user))

// Bác sĩ nhận bệnh nhân vào phòng khám (backend: PATCH /visits/{id}/start-exam, CheckedIn → Examining — cập nhật có điều kiện
// "còn CheckedIn và chưa có bác sĩ", nên hai bác sĩ không bao giờ nhận trùng; trượt → 409 VISIT_TAKEN), hoặc khám tiếp sau xét nghiệm.
// Mỗi lúc chỉ khám 1 người: phải chốt đơn hoặc chuyển đi xét nghiệm người đang khám rồi mới mời người khác
// (tránh bỏ quên bệnh nhân đang khám dở). Ngoại lệ: ca ƯU TIÊN — bác sĩ xác nhận (force) và hệ thống ghi nhật ký.
// Bị chặn → trả { busy: lượt đang khám, target: lượt định mời } để giao diện hỏi lại.
// Backend thật: server kiểm tra lại điều kiện này trong cùng giao dịch.
export function takePatient(id, user, { force = false } = {}) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || ![ST.CHECKED_IN, ST.EXAMINING, ST.WAITING].includes(v.status)) return { ok: false, error: 'This patient is not waiting for consultation.' }
  // Chưa check-in (lễ tân chưa xác nhận có mặt): backend chặn start-exam (INVALID_TRANSITION).
  if (v.status === ST.WAITING) return { ok: false, error: 'This patient has not been checked in yet — ask reception to check them in when they are at the desk.' }
  // Bệnh nhân của bác sĩ KHÁC (đang trong phòng họ / đi xét nghiệm theo phiếu của họ): backend trả 409 VISIT_TAKEN.
  // Bác sĩ đó phải "Trả về hàng chờ" (release) thì người khác mới nhận được.
  const other = v.status === ST.EXAMINING && v.doctor && !isMine(v, user)
  if (other) return { ok: false, error: v.labOut ? 'This patient is out for lab tests under another doctor.' : 'Another doctor is already seeing this patient.' }
  const resume = atLabs(v) // khám tiếp sau xét nghiệm
  const reopen = inRoom(v) // mở lại bệnh nhân đang ở trong phòng mình
  const busy = inRoomOf(user).filter((x) => x.id !== id)
  if (busy.length && !(force && v.priority))
    return { ok: false, busy: busy[0], target: v, error: 'Finish the patient in your room first — finalize the visit or send them for lab tests.' }
  // Backend thật: server quyết định ai nhận được (409 VISIT_TAKEN nếu bác sĩ khác nhận trước);
  // phòng lấy từ GET /queue (phòng cố định của bác sĩ đang khám).
  if (!DEMO_MODE) {
    if (reopen) return { ok: true, visit: v }
    if (resume) {
      // Đi xét nghiệm chỉ là cờ ở máy này, server vẫn Examining: không gọi start-exam (server trả 409 INVALID_TRANSITION).
      // Máy quầy chưa nhận được lệnh gọi qua server → không hiện thanh "quầy đang gọi" (entered: true).
      patch(id, { labOut: false, resumedFromLabs: true, calledAt: new Date().toISOString(), entered: true })
      return { ok: true, visit: state.visits.find((x) => x.id === id) }
    }
    return apiStartExam(id).then(
      async () => {
        await syncQueue()
        patch(id, { calledAt: new Date().toISOString() })
        return { ok: true, visit: state.visits.find((x) => x.id === id) ?? v }
      },
      (e) => (syncQueue(), { ok: false, error: e.message })
    )
  }
  const at = new Date().toISOString()
  const fresh = !reopen // vừa được mời (không phải mở lại bệnh nhân đang ở trong phòng)
  const next = {
    ...state,
    visits: state.visits.map((x) =>
      x.id === id
        ? {
            ...x,
            status: ST.EXAMINING,
            labOut: false,
            statusAt: fresh ? at : x.statusAt,
            examStartedAt: x.examStartedAt ?? at,
            doctor: user.name,
            doctorId: user.id,
            absent: false,
            // Phòng khám cố định của bác sĩ: lễ tân hướng bệnh nhân đúng phòng.
            room: user.room || x.room || '',
            ...(fresh ? { calledAt: at, entered: false, resumedFromLabs: resume } : {})
          }
        : x
    )
  }
  commit(fresh ? pushCall(next, next.visits.find((x) => x.id === id), user, 'call') : next)
  if (busy.length)
    logEvent(user, 'queue.take_override', {
      target: { kind: 'patient', id: v.patientId, label: v.name },
      params: { patient: v.name, current: busy.map((x) => x.name).join(', ') }
    })
  return { ok: true, visit: state.visits.find((x) => x.id === id) }
}
// Mời bệnh nhân kế tiếp ĐÃ CHECK-IN (cấp cứu → ưu tiên → theo số) vào phòng khám.
export function takeNext(user, opts) {
  const list = readyOrder()
  const next = list.find((v) => !v.absent) ?? list[0]
  if (!next) return { ok: false, error: waitingOrder().length ? 'Nobody is checked in yet — reception checks patients in when it is their turn.' : 'No one is waiting.' }
  return takePatient(next.id, user, opts)
}
// Bác sĩ "mở lại đơn" vừa chốt để sửa (backend: POST …/prescription/reopen, Prescribed → Examining)
// — CHỈ khi lễ tân chưa lập hoá đơn (chưa thu tiền, chưa xuất thuốc).
// Đơn đã thu tiền / đã xuất kho là chứng từ, không sửa: ghi đánh giá "cần điều chỉnh" và kê đơn mới ở lần khám sau.
export function recallVisit(id, user) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || v.status !== ST.PRESCRIBED) return { ok: false, error: 'Only prescriptions still awaiting payment can be recalled.' }
  if (!isMine(v, user)) return { ok: false, error: 'Only the prescribing doctor can recall this prescription.' }
  // Backend thật: server kiểm lại (chưa thu tiền, chưa cấp thuốc), hoàn kho, hủy đơn + hóa đơn, lượt khám về Examining.
  if (!DEMO_MODE) {
    if (inRoomOf(user).length) return { ok: false, error: 'Finish the patient in your room first — finalize the visit or send them for lab tests.' }
    return apiReopen(id, 'Bác sĩ thu hồi đơn để sửa').then(
      async () => {
        await syncQueue()
        logEvent(user, 'rx.recall', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name, rx: String(v.ticket).padStart(3, '0') } })
        return { ok: true }
      },
      (e) => ({ ok: false, error: e.message })
    )
  }
  const cur = v.invoiceId && invoiceById(v.invoiceId)
  if (cur?.status === 'paid') return { ok: false, error: 'This visit has already been paid — the prescription can no longer be reopened.' }
  if ((v.rx ?? []).some((l) => l.dispense_status === 'Dispensed')) return { ok: false, error: 'Some drugs have already been dispensed — the prescription can no longer be reopened.' }
  if (inRoomOf(user).length) return { ok: false, error: 'Finish the patient in your room first — finalize the visit or send them for lab tests.' }
  const at = new Date().toISOString()
  // Hoàn kho về đúng các lô đã trừ lúc chốt đơn, huỷ hoá đơn pending (lập lại khi chốt đơn lần nữa).
  restoreAllocations((v.rx ?? []).map((l) => l.alloc ?? []), rxRef(v), user, 'Returned — prescription reopened')
  if (cur && cur.status === 'pending') cancelInvoice(cur.id, 'Prescription reopened by the doctor', user)
  patch(id, { status: ST.EXAMINING, labOut: false, statusAt: at, recalledAt: at, invoiceId: null, rx: (v.rx ?? []).map(({ alloc, dispense_status, ...l }) => l) })
  logEvent(user, 'rx.recall', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name, rx: String(v.ticket).padStart(3, '0') } })
  return { ok: true }
}
// Chỉ định xét nghiệm (làm thủ công): bác sĩ lập + in phiếu, bệnh nhân đi xét nghiệm (vẫn Examining, labOut = true),
// cầm kết quả giấy quay lại thì bác sĩ bấm "Khám tiếp". Một lượt khám có thể chỉ định nhiều lần (labOrders).
// order: { tests: [{ code, name, group, sample }], other, diagnosis, note }
export function sendToLabs(id, { tests, other = '', diagnosis = '', note = '' }, user) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || !inRoom(v)) return { ok: false, error: 'This patient is not in consultation.' }
  if (!tests.length && !other.trim()) return { ok: false, error: 'Select at least one test.' }
  const at = new Date().toISOString()
  const order = { id: 'cd' + Date.now(), tests, other: other.trim(), diagnosis: diagnosis.trim(), note: note.trim(), at, by: user.name }
  patch(id, { labOut: true, labReturnedAt: null, statusAt: at, labOrders: [...(v.labOrders ?? []), order], doctor: v.doctor || user.name, doctorId: v.doctorId ?? user.id })
  logEvent(user, 'lab.order', {
    target: { kind: 'patient', id: v.patientId, label: v.name },
    params: { patient: v.name, tests: [...tests.map((x) => x.name), ...(order.other ? [order.other] : [])].join(', ') }
  })
  return { ok: true, order }
}
// Tên các xét nghiệm của một phiếu chỉ định (hiển thị gọn trên 1 dòng).
export const labOrderSummary = (o) => [...o.tests.map((x) => x.name), ...(o.other ? [o.other] : [])].join(', ')
// Từng dòng xét nghiệm của một phiếu kèm kết quả đã ghi: key = "<mã phiếu>:<mã xét nghiệm>" ("other" = xét nghiệm ngoài danh mục).
export const labRows = (o) => [
  ...o.tests.map((x) => ({ key: o.id + ':' + x.code, name: x.name, result: x.result ?? '' })),
  ...(o.other ? [{ key: o.id + ':other', name: o.other, result: o.otherResult ?? '' }] : [])
]
// Ghi kết quả { "<mã phiếu>:<mã xét nghiệm>": kết quả } vào đúng dòng của các phiếu chỉ định.
function withLabResults(orders = [], labResults = {}) {
  const val = (key, old) => (labResults[key] ?? old ?? '').trim()
  return orders.map((o) => ({
    ...o,
    tests: o.tests.map((x) => ({ ...x, result: val(o.id + ':' + x.code, x.result) })),
    ...(o.other ? { otherResult: val(o.id + ':other', o.otherResult) } : {})
  }))
}
// Chốt đơn & kết thúc khám (backend: POST …/prescription/confirm, hoặc …/complete-exam khi không kê đơn):
// lưu chẩn đoán + đơn thuốc, lượt sang Prescribed ("Chờ thanh toán") để lễ tân cấp phát, thu tiền.
// rx: [{ name, qty, unit, usage, essential }]; override: lý do bác sĩ vẫn kê dù có cảnh báo tương tác mức nặng.
// labResults: { "<mã phiếu>:<mã xét nghiệm>": kết quả } — ghi vào đúng dòng của phiếu chỉ định; labResult = kết luận chung.
// followUp: ngày hẹn tái khám (yyyy-mm-dd) — in trên đơn, lễ tân thấy để nhắc bệnh nhân.
// hpi: bệnh sử do bác sĩ ghi (khác lý do khám lễ tân ghi lúc tiếp đón); diagnosesExtra: chẩn đoán phụ / bệnh kèm.
export function finalizeVisit(id, { rx, diagnosis, diagnosesExtra = [], hpi = '', exam, plan, vitals, override, labResult = '', labResults = {}, followUp = '', aiDecision = null }, user) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || v.status !== ST.EXAMINING) return { ok: false, error: 'This patient is not in consultation.' }
  const at = new Date().toISOString()
  const labOrders = withLabResults(v.labOrders, labResults)
  const entered = labOrders.flatMap((o, i) => labRows(o).filter((r, j) => r.result && r.result !== (labRows(v.labOrders[i])[j].result ?? '')))
  // Trừ kho NGAY khi chốt đơn (một giao dịch, FEFO, chỉ lô còn hạn qua hết đợt dùng) — thiếu thì chặn, không đổi gì.
  const { drugs } = getInventory()
  const lines = rx.map((l, i) => {
    const d = findDrugByName(l.name, drugs)
    return { ...l, drugId: d?.id ?? null, outside: !!d && soldOutside(d), days: Number(l.dose?.days) || 0, i }
  })
  const unknown = lines.filter((l) => !l.drugId)
  if (unknown.length) return { ok: false, code: 'UNKNOWN_DRUG', error: 'Not in the drug catalog: ' + unknown.map((l) => l.name).join(', ') }
  const ref = rxRef(v)
  const ded = deductForCourse(
    lines.filter((l) => !l.outside).map((l) => ({ key: l.i, drugId: l.drugId, qty: l.qty, days: l.days })),
    ref,
    user
  )
  if (!ded.ok)
    return {
      ok: false,
      code: 'INSUFFICIENT_STOCK',
      short: ded.short.map((x) => ({ ...x, name: lines[x.key].name })),
      error: 'Not enough usable stock — change or remove these drugs before confirming.'
    }
  const rxSaved = lines.map(({ i, days, ...l }) =>
    l.outside ? { ...l, dispense_status: 'Outside', alloc: [] } : { ...l, dispense_status: 'Pending', alloc: ded.alloc[i] ?? [] }
  )
  if (state.calling === id) state = { ...state, calling: null }
  patch(id, {
    status: ST.PRESCRIBED,
    labOut: false,
    statusAt: at,
    entered: true,
    returnNote: null,
    released: null,
    doctor: user.name,
    doctorId: user.id,
    rx: rxSaved,
    rxAt: rx.length ? at : null,
    finalizedAt: at,
    diagnosis,
    diagnosesExtra,
    hpi,
    exam,
    plan,
    followUp,
    labResult,
    labOrders,
    vitals: { ...v.vitals, ...vitals },
    override: override || '',
    // Quyết định của bác sĩ so với gợi ý AI đã hiển thị (AcceptedTop | ChoseOther | NoSuggestion) — cho tỉ lệ chấp nhận AI.
    aiDecision
  })
  if (entered.length)
    logEvent(user, 'lab.result', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { test: entered.map((r) => r.name).join(', '), patient: v.name } })
  logEvent(user, 'rx.finalize', {
    target: { kind: 'patient', id: v.patientId, label: v.name },
    params: { rx: String(v.ticket).padStart(3, '0') + ' — ' + v.name, patient: v.name }
  })
  // Hoá đơn pending tự tạo (phí khám + thuốc nhà thuốc bán) — lễ tân thêm dòng dịch vụ, cấp phát, thu tiền.
  const inv = issueInvoice(state.visits.find((x) => x.id === id), { items: invoiceLinesOf(state.visits.find((x) => x.id === id)), status: 'pending' }, user)
  patch(id, { invoiceId: inv.id })
  return { ok: true, invoice: inv }
}

// Bệnh nhân bỏ về giữa chừng / không quay lại sau xét nghiệm / từ chối khám: bác sĩ đóng lượt (không lập hoá đơn),
// bắt buộc lý do; ghi chép đã viết (draft) được lưu kèm để không mất. Muốn thu phí khám thì chốt lượt khám không kê thuốc.
export function leaveVisit(id, { reason, note = '', draft = null }, user) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || v.status !== ST.EXAMINING || !isMine(v, user)) return { ok: false, error: 'Only your own patients in consultation or out for lab tests can be closed.' }
  if (!LEFT_REASONS.some((r) => r.key === reason)) return { ok: false, error: 'Choose a reason.' }
  if (reason === 'other' && !note.trim()) return { ok: false, error: 'Describe what happened.' }
  if (!DEMO_MODE) {
    const label = LEFT_REASONS.find((r) => r.key === reason).label
    return viaApi(apiCancelVisit(id, [VI[label] ?? label, note.trim()].filter(Boolean).join(' — ')))
  }
  const at = new Date().toISOString()
  patch(id, { status: ST.CANCELLED, labOut: false, statusAt: at, left: { reason, note: note.trim(), at, by: user.name, from: v.status }, draftNotes: draft, released: null })
  logEvent(user, 'visit.left', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name, reason, note: note.trim() }, level: 'warning' })
  return { ok: true }
}

// Quầy huỷ lượt đang CHỜ khám (Waiting / CheckedIn — backend: PATCH /visits/{id}/cancel {reason}): bệnh nhân về trước khi được gọi,
// hoặc tiếp đón nhầm / trùng lượt. Không xoá — lượt sang Cancelled kèm lý do.
export function cancelVisit(id, { reason, note = '' }, user) {
  if (!DEMO_MODE) {
    if (!CANCEL_REASONS.some((r) => r.key === reason)) return Promise.resolve({ ok: false, error: 'Choose a reason.' })
    if (reason === 'other' && !note.trim()) return Promise.resolve({ ok: false, error: 'Describe what happened.' })
    const label = CANCEL_REASONS.find((r) => r.key === reason).label
    // Server lưu lý do dạng chữ (audit_log) — ghi tiếng Việt.
    return viaApi(apiCancelVisit(id, [VI[label] ?? label, note.trim()].filter(Boolean).join(' — ')))
  }
  const v = state.visits.find((x) => x.id === id)
  if (!v || !isQueued(v)) return { ok: false, error: 'Only visits still waiting for consultation can be cancelled here.' }
  // Bệnh nhân đang có ca cờ đỏ chờ bác sĩ đánh giá: không cho quầy tự đóng lượt — bác sĩ quyết (chuyển tuyến / khám tại chỗ).
  if (state.redFlags.some((r) => r.visitId === id && !r.doctorReview)) return { ok: false, error: 'This patient has warning signs waiting for a doctor — let the doctor decide first.' }
  if (!CANCEL_REASONS.some((r) => r.key === reason)) return { ok: false, error: 'Choose a reason.' }
  if (reason === 'other' && !note.trim()) return { ok: false, error: 'Describe what happened.' }
  const at = new Date().toISOString()
  commit({
    ...state,
    calling: state.calling === id ? null : state.calling,
    visits: state.visits.map((x) => (x.id === id ? { ...x, status: ST.CANCELLED, statusAt: at, left: { reason, note: note.trim(), at, by: user.name, from: v.status } } : x))
  })
  logEvent(user, 'visit.cancel', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name, ticket: v.ticket, reason, note: note.trim() }, level: 'warning' })
  return { ok: true }
}

// Quầy sửa lượt đang chờ: lý do khám, sinh hiệu đo lại, bật / tắt ưu tiên (bệnh nhân chuyển nặng trong lúc chờ).
// Sửa lượt đang chờ (backend: PATCH /visits/{id} — chỉ khi Waiting): đo lại sinh hiệu, cập nhật triệu chứng, bật ưu tiên.
// Mức phân loại chỉ được NÂNG (luật chạy lại với dữ liệu mới), không bao giờ hạ.
const RANK = { routine: 0, high: 1, emergency: 2 }
export function updateWaitingVisit(id, { reason, symptoms, days, vitals, priority, triage, triageRules }, user) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || v.status !== ST.WAITING) return { ok: false, error: 'Only visits still waiting for consultation can be edited here.' }
  const at = new Date().toISOString()
  const level = triage && RANK[triage] > RANK[v.triage ?? 'routine'] ? triage : v.triage ?? 'routine'
  patch(id, {
    reason: (reason ?? '').trim() || '—',
    ...(vitals ? { vitals } : {}),
    ...(symptoms ? { symptoms: symptoms.map((x) => ({ confirmed_by: user.id, confirmed_at: at, ...x })) } : {}),
    ...(days !== undefined ? { days: days === '' || days == null ? null : Number(days) } : {}),
    triage: level,
    triageRules: [...new Set([...(v.triageRules ?? []), ...(triageRules ?? [])])],
    priority: !!priority || level !== 'routine'
  })
  if (!!priority !== !!v.priority)
    logEvent(user, 'queue.priority', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name, reason: priority ? 'condition worsened while waiting' : 'priority removed' } })
  logEvent(user, 'visit.update', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name, ticket: v.ticket } })
  return { ok: true }
}

// Lễ tân thấy bệnh nhân cầm kết quả xét nghiệm quay lại → báo bác sĩ phụ trách (chuông + nhãn "Đã về" ở hàng chờ).
export function markLabReturned(id) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || !atLabs(v)) return { ok: false, error: 'This patient is not out for lab tests.' }
  patch(id, { labReturnedAt: new Date().toISOString() })
  return { ok: true }
}

// Trả bệnh nhân về hàng chờ (backend: PATCH /visits/{id}/release, Examining → CheckedIn) — VD bác sĩ phải rời phòng.
// Bất kỳ bác sĩ nào cũng nhận lại được; phiếu khám dở (draft) đi kèm lượt khám để người sau đọc tiếp.
export function releaseVisit(id, { draft = null } = {}, user) {
  const v = state.visits.find((x) => x.id === id)
  if (!v || v.status !== ST.EXAMINING || !isMine(v, user)) return { ok: false, error: 'Only your own patients in consultation can be returned to the queue.' }
  if (!DEMO_MODE) return viaApi(apiRelease(id))
  const at = new Date().toISOString()
  patch(id, { status: ST.CHECKED_IN, labOut: false, statusAt: at, doctor: '', doctorId: null, room: '', released: { by: user.name, at, draft } })
  logEvent(user, 'visit.release', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name } })
  return { ok: true }
}

// Bác sĩ sửa dị ứng / bệnh nền: lưu vào hồ sơ + cập nhật luôn lượt khám đang mở (kiểm tra đơn chạy lại ngay).
export function updateVisitClinical(id, fields, user) {
  const v = state.visits.find((x) => x.id === id)
  if (!v) return { ok: false, error: 'Visit not found.' }
  const r = v.patientId ? updatePatientClinical(v.patientId, fields, user) : { ok: true }
  if (!r.ok) return r
  patch(id, { allergies: fields.allergies.trim(), history: fields.history.trim() })
  return { ok: true }
}

// ---------- Hoá đơn, cấp phát, thu tiền (backend lượt 6b/6c) ----------
// Chứng từ kho của một lượt khám (ref trên thẻ kho cho mọi lần trừ / hoàn).
export const rxRef = (v) => 'RX-' + String(v.ticket).padStart(3, '0') + '-' + String(v.id).slice(-5)

// Dòng hoá đơn tự sinh từ lượt khám: phí khám (Cài đặt › Vận hành) + thuốc nhà thuốc bán, CHƯA bị bỏ qua khi cấp phát.
// Đơn giá chép từ Danh mục thuốc tại thời điểm lập; dòng thuốc giữ rx_index để truy về dòng đơn.
export function invoiceLinesOf(v, { keepManual = [] } = {}) {
  const { drugs } = getInventory()
  const fee = { item_type: 'Consultation', name: 'Consultation fee', qty: 1, unit_price: getSettings().ops.consultFee, amount: getSettings().ops.consultFee, auto: true }
  const drugLines = (v.rx ?? [])
    .map((l, i) => ({ l, i, d: findDrugByName(l.name, drugs) }))
    .filter(({ l, d }) => d && l.dispense_status !== 'Skipped' && l.dispense_status !== 'Outside' && !soldOutside(d))
    .map(({ l, i, d }) => ({ item_type: 'Drug', name: l.name, qty: l.qty, unit: d.unit, unit_price: d.price, amount: d.price * l.qty, rx_index: i }))
  const manual = keepManual.filter((x) => itemType(x) !== 'Drug' && !x.auto)
  const hasFee = keepManual.some((x) => x.auto && itemType(x) === 'Consultation') || !keepManual.length
  return [...(hasFee ? [fee] : []), ...manual, ...drugLines]
}

// Hoá đơn của lượt (tạo nếu lượt Prescribed từ dữ liệu cũ chưa có hoá đơn).
export function ensureInvoice(visitId, user) {
  const v = state.visits.find((x) => x.id === visitId)
  if (!v || v.status !== ST.PRESCRIBED) return v?.invoiceId ? invoiceById(v.invoiceId) : null
  const cur = activeInvoiceOf(visitId) ?? (v.invoiceId && invoiceById(v.invoiceId))
  if (cur && cur.status !== 'cancelled') return cur
  const inv = issueInvoice(v, { items: invoiceLinesOf(v), status: 'pending' }, user)
  patch(visitId, { invoiceId: inv.id })
  return inv
}

// Đã thu tiền VÀ mọi dòng thuốc đã cấp / bỏ qua → Finished.
function finishIfDone(visitId) {
  const v = state.visits.find((x) => x.id === visitId)
  const inv = v?.invoiceId && invoiceById(v.invoiceId)
  if (v?.status === ST.PRESCRIBED && inv?.status === 'paid' && (v.rx ?? []).every((l) => l.dispense_status !== 'Pending'))
    patch(visitId, { status: ST.FINISHED, statusAt: new Date().toISOString() })
}
// Còn bao nhiêu dòng chờ cấp.
export const pendingDispense = (v) => (v?.rx ?? []).filter((l) => l.dispense_status === 'Pending')

// Cấp phát từng dòng (backend: PATCH /prescription-items/{id}/dispense). status: 'Dispensed' | 'Skipped' (bắt buộc lý do).
// Đã trừ kho lúc bác sĩ chốt đơn nên "Đã cấp" KHÔNG trừ lần nữa; "Bỏ qua" hoàn kho về đúng lô và lập lại hoá đơn.
export function dispenseItem(visitId, index, { status, reason = '' }, user) {
  const v = state.visits.find((x) => x.id === visitId)
  if (!v || v.status !== ST.PRESCRIBED) return { ok: false, error: 'This visit is not waiting for dispensing.' }
  const line = v.rx?.[index]
  if (!line || line.dispense_status !== 'Pending') return { ok: false, error: 'This drug has already been handled.' }
  const at = new Date().toISOString()
  if (status === 'Dispensed') {
    patch(visitId, { rx: v.rx.map((l, i) => (i === index ? { ...l, dispense_status: 'Dispensed', dispensed_by: user.name, dispensed_at: at } : l)) })
    logEvent(user, 'rx.dispensed', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name, item: line.name, qty: line.qty } })
  } else if (status === 'Skipped') {
    if (!reason.trim()) return { ok: false, error: 'Enter a reason for skipping this drug.' }
    const inv = v.invoiceId && invoiceById(v.invoiceId)
    if (inv?.status === 'paid') return { ok: false, error: 'This invoice has already been paid — an administrator must cancel it before a drug can be skipped.' }
    restoreAllocations([line.alloc ?? []], rxRef(v), user, 'Returned — skipped at dispensing')
    const rx = v.rx.map((l, i) => (i === index ? { ...l, dispense_status: 'Skipped', skip_reason: reason.trim(), dispensed_by: user.name, dispensed_at: at, alloc: [] } : l))
    patch(visitId, { rx })
    // Lập lại hoá đơn từ các dòng còn lại (giữ dòng dịch vụ nhập tay).
    const old = inv && inv.status !== 'cancelled' ? inv : null
    if (old) cancelInvoice(old.id, 'Re-issued — ' + line.name + ' skipped at dispensing', user)
    const nv = issueInvoice({ ...v, rx }, { items: invoiceLinesOf({ ...v, rx }, { keepManual: old?.items ?? [] }), status: 'pending', method: old?.method ?? null }, user)
    patch(visitId, { invoiceId: nv.id })
    logEvent(user, 'rx.skipped', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name, item: line.name, reason: reason.trim() }, level: 'warning' })
  } else return { ok: false, error: 'Choose Dispensed or Skipped.' }
  finishIfDone(visitId)
  return { ok: true }
}
// Cấp hết các dòng còn chờ (backend: POST /visits/{id}/dispense-all).
export function dispenseAll(visitId, user) {
  const v = state.visits.find((x) => x.id === visitId)
  if (!v || v.status !== ST.PRESCRIBED) return { ok: false, error: 'This visit is not waiting for dispensing.' }
  for (const [i, l] of (v.rx ?? []).entries()) if (l.dispense_status === 'Pending') dispenseItem(visitId, i, { status: 'Dispensed' }, user)
  return { ok: true }
}

// Sửa dòng dịch vụ của hoá đơn pending (backend: PATCH /visits/{id}/invoice): thêm / bỏ dòng Consultation, Paraclinical.
// Dòng thuốc không sửa ở đây — chúng đi theo đơn bác sĩ và kết quả cấp phát.
export function setServiceLines(visitId, serviceLines, user) {
  const v = state.visits.find((x) => x.id === visitId)
  const inv = v && ensureInvoice(visitId, user)
  if (!inv || inv.status !== 'pending') return { ok: false, error: 'This invoice can no longer be changed.' }
  for (const x of serviceLines) {
    if (!['Consultation', 'Paraclinical'].includes(x.item_type)) return { ok: false, error: 'Service lines must be Consultation or Paraclinical.' }
    if (!String(x.name ?? '').trim() || !(Number(x.amount) >= 0)) return { ok: false, error: 'Each service line needs a name and an amount.' }
  }
  const drugLines = inv.items.filter((x) => itemType(x) === 'Drug')
  const items = [...serviceLines.map((x) => ({ ...x, qty: 1, unit_price: Number(x.amount), amount: Number(x.amount) })), ...drugLines]
  replaceInvoiceItems(inv.id, items, user)
  return { ok: true }
}

// Thu tiền (backend: POST /visits/{id}/invoice/pay). method: 'cash' | 'transfer'.
// waiting = true: khách chuyển khoản nhưng tiền chưa về → chỉ ghi hình thức, hoá đơn vẫn pending (xác nhận sau ở màn Hoá đơn).
export function payVisit(visitId, { method, ref = '', waiting = false }, user) {
  const v = state.visits.find((x) => x.id === visitId)
  if (!v || v.status !== ST.PRESCRIBED) return { ok: false, error: 'This visit is not awaiting payment.' }
  const inv = ensureInvoice(visitId, user)
  if (!inv || inv.status !== 'pending') return { ok: false, error: 'This invoice is not waiting for payment.' }
  if (waiting) return setInvoiceMethod(inv.id, 'transfer', ref, user)
  const r = payInvoice(inv.id, { method, ref }, user)
  if (r.ok) finishIfDone(visitId)
  return r
}
export function confirmVisitPayment(invoiceId, ref, user) {
  const inv = invoiceById(invoiceId)
  const r = payInvoice(invoiceId, { method: inv?.method || 'transfer', ref }, user)
  const v = r.ok && state.visits.find((x) => x.invoiceId === invoiceId)
  if (v) finishIfDone(v.id)
  return r
}

// Huỷ lượt ở bước Chờ thanh toán (bệnh nhân bỏ về trước khi trả tiền / nhận thuốc): hoàn kho các dòng chưa cấp,
// huỷ hoá đơn pending, lượt sang Cancelled. Không áp dụng khi đã thu tiền hoặc đã cấp thuốc.
export function cancelPrescribedVisit(visitId, reason, user) {
  const v = state.visits.find((x) => x.id === visitId)
  if (!v || v.status !== ST.PRESCRIBED) return { ok: false, error: 'This visit is not waiting for payment.' }
  if (!String(reason ?? '').trim()) return { ok: false, error: 'Enter a reason.' }
  const inv = v.invoiceId && invoiceById(v.invoiceId)
  if (inv?.status === 'paid') return { ok: false, error: 'This visit has already been paid.' }
  if ((v.rx ?? []).some((l) => l.dispense_status === 'Dispensed')) return { ok: false, error: 'Some drugs have already been dispensed.' }
  restoreAllocations((v.rx ?? []).map((l) => l.alloc ?? []), rxRef(v), user, 'Returned — visit cancelled before payment')
  if (inv && inv.status === 'pending') cancelInvoice(inv.id, reason.trim(), user)
  const at = new Date().toISOString()
  patch(visitId, { status: ST.CANCELLED, statusAt: at, rx: (v.rx ?? []).map((l) => ({ ...l, alloc: [], dispense_status: l.dispense_status === 'Pending' ? 'Skipped' : l.dispense_status })), left: { reason: 'unpaid_left', note: reason.trim(), at, by: user.name, from: v.status } })
  logEvent(user, 'visit.cancel', { target: { kind: 'patient', id: v.patientId, label: v.name }, params: { patient: v.name, ticket: v.ticket, reason: 'unpaid_left', note: reason.trim() }, level: 'warning' })
  return { ok: true }
}

// Huỷ hoá đơn ĐÃ THU (sai hình thức, thu nhầm…): bắt buộc lý do; người không phải Quản trị viên cần Quản trị viên xác nhận.
// Lượt quay về Chờ thanh toán với hoá đơn pending lập lại. restock: bệnh nhân trả lại toàn bộ thuốc → hoàn kho các dòng đã cấp
// và đánh dấu dòng đó "Bỏ qua" (hoá đơn mới không còn thuốc).
export function voidInvoice(invoiceId, reason, user, { approvedBy = null, restock = false } = {}) {
  const inv = invoiceById(invoiceId)
  if (inv?.status === 'paid' && user.roleKey !== 'admin' && !approvedBy) return { ok: false, error: 'An administrator must confirm cancelling a paid invoice.' }
  const r = cancelInvoice(invoiceId, reason, user, { approvedBy, restocked: restock })
  if (!r.ok) return r
  const v = state.visits.find((x) => x.invoiceId === invoiceId)
  if (!v) return r
  let rx = v.rx ?? []
  if (restock) {
    restoreAllocations(rx.filter((l) => l.dispense_status === 'Dispensed').map((l) => l.alloc ?? []), rxRef(v), user, 'Returned — invoice cancelled')
    rx = rx.map((l) => (l.dispense_status === 'Dispensed' ? { ...l, dispense_status: 'Skipped', skip_reason: 'Returned by the patient', alloc: [] } : l))
  }
  const nv = issueInvoice({ ...v, rx }, { items: invoiceLinesOf({ ...v, rx }, { keepManual: inv.items }), status: 'pending' }, user)
  patch(v.id, { status: ST.PRESCRIBED, statusAt: new Date().toISOString(), invoiceId: nv.id, rx })
  return r
}
// Trạng thái thanh toán của một lượt khám: unpaid | processing (chuyển khoản chờ tiền về) | paid | null (chưa tới bước thanh toán).
export function payStatusOf(v) {
  const inv = v.invoiceId && invoiceById(v.invoiceId)
  if (inv && inv.status !== 'cancelled') return inv.status === 'paid' ? 'paid' : inv.method === 'transfer' ? 'processing' : 'unpaid'
  return v.status === ST.PRESCRIBED ? 'unpaid' : null
}

// ---------- Ca cờ đỏ ----------
// FR09: ca có dấu hiệu nguy hiểm KHÔNG vào hàng chờ khám thường.
// outcome: 'referred' — quầy chuyển viện ngay; 'queued' — luật cờ đỏ khớp, bệnh nhân lên đầu hàng chờ mức Cấp cứu;
//          'assess' — (bản cũ) mời bác sĩ ra đánh giá;
//          'seen' — bác sĩ quyết định khám tại phòng khám (lễ tân tiếp đón ưu tiên).
// Chuyển tuyến là quyết định lâm sàng → mọi ca đều chờ bác sĩ xem (doctorReview), bác sĩ được báo trên chuông.
// ack = false: còn hiện thông báo đỏ ở đầu trang Tiếp đón cho tới khi lễ tân xác nhận đã xử lý xong.
// CỜ ĐỎ = CẤP CỨU vượt khả năng phòng khám (tai nạn, nguy kịch, khó thở nặng…): quầy CHUYỂN VIỆN / gọi 115 NGAY,
// không chờ bác sĩ xác nhận — bác sĩ chỉ được BÁO để ra sơ cứu và ký giấy chuyển tuyến sau ('referred').
// Chưa chắc là cấp cứu → 'assess': mời bác sĩ ra đánh giá ngay.
// visitId: bệnh nhân ĐÃ trong hàng chờ (chuyển nặng lúc chờ): 'referred' → đóng lượt ngay ("chuyển tuyến");
// 'assess' → bật ưu tiên, bác sĩ quyết chuyển tuyến (đóng lượt) hoặc khám tại chỗ (giữ ưu tiên).
export function recordRedFlag({ id, name, gender, age, allergies, history, signs, visitId = null }, user, outcome = 'referred') {
  const rf = {
    id: 'rf' + Date.now(),
    visitId,
    patientId: id ?? null,
    name: name || '—',
    gender,
    age,
    allergies,
    history,
    signs,
    at: new Date().toISOString(),
    by: user.name,
    outcome,
    ack: false,
    doctorReview: null
  }
  const now = rf.at
  const mark = (x) =>
    x.id !== visitId
      ? x
      : outcome === 'referred'
        ? { ...x, status: ST.CANCELLED, labOut: false, statusAt: now, left: { reason: 'referred_out', note: signs ?? '', at: now, by: user.name, from: x.status } }
        : { ...x, priority: true, triage: outcome === 'queued' ? 'emergency' : x.triage }
  commit({ ...state, calling: outcome === 'referred' && state.calling === visitId ? null : state.calling, redFlags: [rf, ...state.redFlags], visits: visitId ? state.visits.map(mark) : state.visits })
  logEvent(user, 'queue.red_flag', { target: { kind: 'patient', id: rf.patientId ?? rf.id, label: rf.name }, params: { patient: rf.name, signs, outcome } })
  return rf
}

// Bác sĩ đánh giá ca cờ đỏ: decision 'referred' (chuyển tuyến / đồng ý chuyển tuyến) | 'seen' (khám tại phòng khám).
export function reviewRedFlag(id, decision, user) {
  const rf = state.redFlags.find((r) => r.id === id)
  if (!rf) return { ok: false, error: 'Case not found.' }
  const doctorReview = { by: user.name, byId: user.id, at: new Date().toISOString(), decision }
  // Bác sĩ đổi quyết định → lễ tân phải xem lại thông báo.
  const at = doctorReview.at
  const close = (x) =>
    x.id === rf.visitId && decision === 'referred' && isQueued(x)
      ? { ...x, status: ST.CANCELLED, statusAt: at, left: { reason: 'referred_out', note: rf.signs ?? '', at, by: user.name, from: x.status } }
      : x
  commit({
    ...state,
    redFlags: state.redFlags.map((r) => (r.id === id ? { ...r, outcome: decision, doctorReview, ack: r.ack && r.outcome === decision } : r)),
    visits: rf.visitId ? state.visits.map(close) : state.visits
  })
  logEvent(user, 'queue.red_flag_review', { target: { kind: 'patient', id: rf.patientId ?? rf.id, label: rf.name }, params: { patient: rf.name, decision } })
  return { ok: true }
}

export function acknowledgeRedFlag(id) {
  commit({ ...state, redFlags: state.redFlags.map((r) => (r.id === id ? { ...r, ack: true } : r)) })
}
