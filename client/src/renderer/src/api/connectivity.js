// Theo dõi kết nối tới máy chủ phòng khám (NFR08, Architecture 5.1.9): hỏi GET /health khoảng 3 giây một lần.
// Không trả lời (máy chủ tắt, đổi IP, mạng LAN lỗi) → chỉ đọc: hiện banner, khoá mọi thao tác ghi; có lại thì tự mở.
// Chế độ giả lập: không có máy chủ → chỉ dựa vào navigator.onLine.
import { useEffect, useSyncExternalStore } from 'react'
import { DEMO_MODE } from './client'
import { getBaseUrl } from './serverConfig'

const INTERVAL_MS = 3000
const TIMEOUT_MS = 2500
let reachable = true
let online = typeof navigator === 'undefined' ? true : navigator.onLine
const subs = new Set()
const emit = () => subs.forEach((f) => f())
const subscribe = (f) => (subs.add(f), () => subs.delete(f))
const snapshot = () => online && reachable

async function probe() {
  if (DEMO_MODE) return
  let ok = false
  try {
    const res = await fetch(getBaseUrl() + '/health', { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
    // /health trả 503 khi CSDL lỗi — máy chủ vẫn trả lời nhưng không ghi được → coi như mất kết nối.
    ok = res.ok
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
  if (!DEMO_MODE) {
    probe()
    setInterval(probe, INTERVAL_MS)
  }
}

// true = tới được máy chủ (ghi được); false = chỉ đọc.
export function useServerOnline() {
  useEffect(start, [])
  return useSyncExternalStore(subscribe, snapshot)
}
export const isServerOnline = snapshot
