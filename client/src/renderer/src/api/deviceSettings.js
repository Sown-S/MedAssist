// Cài đặt riêng của từng máy, không gửi lên server: khổ giấy theo loại giấy tờ, cách hiển thị bảng gọi bệnh nhân.
import { useSyncExternalStore } from 'react'

const KEY = 'medassist_device_v1'
const DEFAULTS = {
  papers: { prescription: 'A5', labOrder: 'A5', invoice: '80mm', other: 'A4' },
  queue: {
    showNames: true, // tắt khi màn hình quầy quay ra phòng chờ
    nextCount: 6
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

// Lưu ngay, không chờ nút Lưu của trang Cài đặt.
export function setDevice(patch) {
  state = { papers: { ...state.papers, ...patch.papers }, queue: { ...state.queue, ...patch.queue } }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {/* không lưu được thì chỉ giữ trong phiên */}
  listeners.forEach((fn) => fn())
}
