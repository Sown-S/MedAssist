// Lượt khám của những ngày trước (bản demo; chạy thật lượt khám nằm trong CSDL). Kết quả khi sang ngày:
// done = đã khám và thanh toán · left = chưa khám xong, coi như bỏ về · carried = chưa thu tiền, chuyển sang ngày mới.
import { useSyncExternalStore } from 'react'

const KEY = 'medassist_visit_archive_v1'

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
let archive = read() ?? []
const listeners = new Set()
function commit(next) {
  archive = next
  try {
    localStorage.setItem(KEY, JSON.stringify(archive))
  } catch {/* không lưu được thì chỉ giữ trong phiên */}
  listeners.forEach((fn) => fn())
}
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getVisitArchive = () => archive
export function useVisitArchive() {
  return useSyncExternalStore(subscribe, getVisitArchive)
}

// Nhận cả tên trạng thái cũ của client lẫn tên của backend.
export const outcomeOf = (v) => (['done', 'Finished'].includes(v.status) ? 'done' : ['payment', 'Prescribed'].includes(v.status) ? 'carried' : 'left')

// Bỏ qua lượt đã chép (lượt chuyển tiếp nhiều ngày chỉ giữ bản mới nhất).
export function archiveDay(visits, day) {
  const fresh = visits.map((v) => ({ ...v, day, outcome: outcomeOf(v) }))
  const ids = new Set(fresh.map((v) => v.id + '|' + day))
  commit([...fresh, ...archive.filter((v) => !ids.has(v.id + '|' + v.day))])
}
