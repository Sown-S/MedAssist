// CÀI ĐẶT RIÊNG MÁY NÀY — không gửi lên server, mỗi máy của phòng khám tự đặt (máy quầy in nhiệt 80 mm,
// máy bác sĩ in A5...): khổ giấy theo loại giấy tờ, cách hiển thị bảng gọi bệnh nhân ở quầy.
// (Ngôn ngữ giao diện và địa chỉ máy chủ cũng là cài đặt riêng máy, lưu ở i18n và serverConfig.)
import { useSyncExternalStore } from 'react'

const KEY = 'medassist_device_v1'
const DEFAULTS = {
  papers: { prescription: 'A5', labOrder: 'A5', invoice: '80mm', other: 'A4' },
  queue: {
    showNames: true, // hiện họ tên ở bảng gọi bệnh nhân (tắt nếu màn hình quầy quay ra phòng chờ)
    nextCount: 6 // số bệnh nhân kế tiếp hiện ở bảng gọi
  }
}

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY)) ?? {}
    return { papers: { ...DEFAULTS.papers, ...s.papers }, queue: { ...DEFAULTS.queue, ...s.queue } }
  } catch {
    return DEFAULTS
  }
}
let state = read()
const listeners = new Set()
const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn))

export const getDevice = () => state
export const useDevice = () => useSyncExternalStore(subscribe, getDevice)

// patch: { papers?: {...}, queue?: {...} } — lưu ngay, không cần nút Lưu chung của trang Cài đặt.
export function setDevice(patch) {
  state = { papers: { ...state.papers, ...patch.papers }, queue: { ...state.queue, ...patch.queue } }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* chỉ giữ trong phiên */
  }
  listeners.forEach((fn) => fn())
}
