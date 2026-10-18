// ĐÂY LÀ LỚP GIẢ LẬP (demo) cho bảng prescription_reviews — bác sĩ đánh giá lại đơn thuốc ĐÃ CHỐT.
// Đơn đã chốt là bệnh án + chứng từ nên KHÔNG BAO GIỜ bị sửa: đánh giá chỉ GHI THÊM bên cạnh đơn.
// Muốn đổi thuốc: thu hồi đơn (nếu lễ tân chưa thu tiền — queueStore.recallVisit) hoặc kê đơn mới ở lần khám sau;
// đánh giá "cần điều chỉnh" / "lo ngại an toàn" sẽ nhắc bác sĩ ngay khi bệnh nhân này vào phòng khám lần tới.
// Backend thật: GET/POST /prescriptions/{id}/reviews, PATCH /prescription-reviews/{id}/resolve.
import { useSyncExternalStore } from 'react'
import { logEvent } from './activityStore'

const KEY = 'medassist_rx_reviews_v1'

export const VERDICTS = [
  { key: 'ok', label: 'Appropriate', tone: 'ok' },
  { key: 'adjust', label: 'Needs adjustment', tone: 'warn' },
  { key: 'concern', label: 'Safety concern', tone: 'low' }
]
export const verdictOf = (k) => VERDICTS.find((v) => v.key === k) ?? VERDICTS[0]

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
let reviews = read() ?? []
const listeners = new Set()
function commit(next) {
  reviews = next
  try {
    localStorage.setItem(KEY, JSON.stringify(reviews))
  } catch {
    /* chỉ giữ trong phiên */
  }
  listeners.forEach((fn) => fn())
}
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getRxReviews = () => reviews
export function useRxReviews() {
  return useSyncExternalStore(subscribe, getRxReviews)
}

// Ngày kê đơn theo giờ máy, dạng dd/mm/yyyy (để câu nhật ký đọc được).
function dayOfRx(rx) {
  if (!rx.rxAt) return '—'
  const d = new Date(rx.rxAt)
  return [d.getDate(), d.getMonth() + 1].map((n) => String(n).padStart(2, '0')).join('/') + '/' + d.getFullYear()
}
const target = (rx) => ({ kind: 'patient', id: rx.patientId, label: rx.name })

// rx: lượt khám / đơn thuốc (id, patientId, name, rxAt); verdict: ok | adjust | concern.
export function addReview(rx, { verdict, note }, user) {
  const text = (note ?? '').trim()
  if (!VERDICTS.some((v) => v.key === verdict)) return { ok: false, error: 'Choose a verdict.' }
  if (verdict !== 'ok' && !text) return { ok: false, error: 'Describe what should be adjusted.' }
  const r = {
    id: 'rv' + Date.now(),
    rxId: rx.id,
    patientId: rx.patientId,
    patient: rx.name,
    rxAt: rx.rxAt ?? null,
    verdict,
    note: text,
    by: user.name,
    byId: user.id,
    at: new Date().toISOString(),
    resolved: null
  }
  commit([r, ...reviews])
  logEvent(user, 'rx.review', { target: target(rx), params: { patient: rx.name, day: dayOfRx(rx), verdict, note: text }, level: verdict === 'ok' ? 'info' : 'warning' })
  return { ok: true, review: r }
}

// Đánh dấu đã xử lý (VD đã kê đơn mới ở lượt khám visitId).
export function resolveReview(id, visitId, user) {
  const r = reviews.find((x) => x.id === id)
  if (!r || r.resolved) return { ok: false, error: 'Review not found.' }
  commit(reviews.map((x) => (x.id === id ? { ...x, resolved: { by: user.name, byId: user.id, at: new Date().toISOString(), visitId } } : x)))
  logEvent(user, 'rx.review_resolved', { target: { kind: 'patient', id: r.patientId, label: r.patient }, params: { patient: r.patient, day: dayOfRx(r) } })
  return { ok: true }
}

export const reviewsOf = (rxId, list = reviews) => list.filter((r) => r.rxId === rxId)
// Đánh giá còn mở (cần điều chỉnh / lo ngại an toàn, chưa xử lý) của một bệnh nhân — nhắc ở phòng khám.
export const openReviewsFor = (patientId, list = reviews) => list.filter((r) => r.patientId === patientId && r.verdict !== 'ok' && !r.resolved)
