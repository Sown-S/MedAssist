import { getReduceMotion } from './appTheme'

// Hiệu ứng chuyển động dùng chung. Mọi hiệu ứng chạy bằng JS phải hỏi motionOff() trước:
// CSS đã tự tắt theo :root[data-motion="reduce"] / prefers-reduced-motion, còn JS (đếm số) thì không.

// Tắt hiệu ứng khi: người dùng bật "Giảm hiệu ứng" trong Cài đặt, Windows bật giảm chuyển động,
// hoặc môi trường không có matchMedia (test jsdom) — khi đó hiện ngay giá trị cuối.
export function motionOff() {
  if (getReduceMotion()) return true
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Tách phần số trong chuỗi hiển thị để đếm lên mà giữ nguyên định dạng:
// 12 → {n:12}; "89.000 đ" → {n:89000, pre:'', post:' đ', sep:'.'}; "94,4%" giữ nguyên (số thập phân không đếm).
export function splitNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) && Number.isInteger(value) ? { n: value, pre: '', post: '', sep: '' } : null
  if (typeof value !== 'string') return null
  const m = value.match(/^(\D*?)(\d{1,3}(?:\.\d{3})+|\d+)(\D*)$/)
  if (!m || /[,]\d/.test(m[3])) return null
  return { n: Number(m[2].replace(/\./g, '')), pre: m[1], post: m[3], sep: m[2].includes('.') ? '.' : '' }
}

export function joinNumber(parts, n) {
  const digits = String(Math.round(n))
  const body = parts.sep ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, parts.sep) : digits
  return parts.pre + body + parts.post
}
