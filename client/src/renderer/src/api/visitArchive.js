// ĐÂY LÀ LỚP GIẢ LẬP (demo) cho các lượt khám của NHỮNG NGÀY TRƯỚC (bảng visits, đã đóng ngày).
// Hàng chờ (queueStore) chỉ giữ hôm nay; sang ngày mới thì MỌI lượt của ngày cũ được chép vào đây kèm kết quả:
//   done     — đã khám & thanh toán xong
//   left     — chưa khám xong (đang chờ khám / đang khám / đang đi xét nghiệm) khi hết ngày → coi như bỏ về
//   carried  — chưa thu tiền → được chuyển sang hàng chờ ngày mới để thu tiếp (không mất công nợ)
// Lịch sử ĐƠN THUỐC vẫn ở rxHistory (chỉ lượt có đơn) để màn Đơn thuốc không lẫn lượt không kê thuốc.
// Backend thật: không cần bước chép — visits giữ nguyên trong DB, lọc theo ngày.
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
  } catch {
    /* chỉ giữ trong phiên */
  }
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

// Kết quả của lượt khi sang ngày (nhận cả tên trạng thái cũ của client lẫn tên của backend).
export const outcomeOf = (v) => (['done', 'Finished'].includes(v.status) ? 'done' : ['payment', 'Prescribed'].includes(v.status) ? 'carried' : 'left')

// Chép các lượt của ngày cũ (bỏ qua lượt đã chép — VD lượt được chuyển tiếp nhiều ngày chỉ giữ bản mới nhất).
export function archiveDay(visits, day) {
  const fresh = visits.map((v) => ({ ...v, day, outcome: outcomeOf(v) }))
  const ids = new Set(fresh.map((v) => v.id + '|' + day))
  commit([...fresh, ...archive.filter((v) => !ids.has(v.id + '|' + v.day))])
}
