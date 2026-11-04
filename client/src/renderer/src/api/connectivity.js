// Theo dõi kết nối máy chủ (NFR08): hỏi GET /health khoảng 3 giây một lần. Không trả lời → chế độ chỉ đọc,
// khoá mọi thao tác ghi; có lại thì tự mở.
import { useEffect, useSyncExternalStore } from 'react'
import { getBaseUrl } from './serverConfig'

const INTERVAL_MS = 3000
const TIMEOUT_MS = 2500
let reachable = true
let online = typeof navigator === 'undefined' ? true : navigator.onLine
const subs = new Set()
const emit = () => subs.forEach((f) => f())
const subscribe = (f) => (subs.add(f), () => subs.delete(f))
const snapshot = () => online && reachable

// Trạng thái AI theo /health: reason (khi ok = false) là disabled | unreachable | no_model | worker_stopped.
// Dựa vào mã, không dò câu chữ trong detail. Server cũ không có reason → coi như tạm hỏng (không phải tắt hẳn).
const AI_OK = { ok: true, reason: null, detail: '' }
let ai = AI_OK
function readAi(body) {
  const a = body?.ai
  // ok = null: CSDL lỗi nên server chưa kiểm AI — giữ trạng thái cũ.
  if (!a || a.ok === null || a.ok === undefined) return
  const next = a.ok ? AI_OK : { ok: false, reason: a.reason ?? 'unreachable', detail: a.detail ?? '' }
  if (next.ok !== ai.ok || next.reason !== ai.reason || next.detail !== ai.detail) {
    ai = next
    emit()
  }
}

async function probe() {
  let ok = false
  try {
    const res = await fetch(getBaseUrl() + '/health', { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
    // /health trả 503 khi CSDL lỗi: máy chủ vẫn trả lời nhưng không ghi được → coi như mất kết nối.
    ok = res.ok
    readAi(await res.json().catch(() => null))
  } catch {
    ok = false
  }
  if (ok !== reachable) {
    reachable = ok
    emit()
  }
}

let started = false
function start() {
  if (started) return
  started = true
  window.addEventListener('online', () => ((online = true), emit(), probe()))
  window.addEventListener('offline', () => ((online = false), emit()))
  probe()
  setInterval(probe, INTERVAL_MS)
}

export function useServerOnline() {
  useEffect(start, [])
  return useSyncExternalStore(subscribe, snapshot)
}
export const isServerOnline = snapshot

// { ok, reason, detail } — khung đề xuất từ lời kể ẩn khi disabled, báo vàng và khoá nút khi hỏng, tự mở lại khi ok.
export function useAiHealth() {
  useEffect(start, [])
  return useSyncExternalStore(subscribe, () => ai)
}
