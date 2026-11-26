import { useEffect, useRef, useState } from 'react'
import { motionOff, splitNumber, joinNumber } from '../api/motion'

const ease = (t) => 1 - Math.pow(1 - t, 3)

// Số đếm lên khi ô số liệu vừa hiện (0 → giá trị, 750 ms). Về sau giá trị đổi (hàng chờ tự cập nhật) thì chỉ trượt
// nhanh từ số cũ sang số mới (300 ms) — không chạy lại từ 0 để màn hình không nhấp nháy.
// Giá trị không phải số nguyên (94,4%, "—") hoặc đang giảm hiệu ứng → hiện thẳng.
export default function CountUp({ value }) {
  const parts = splitNumber(value)
  const target = parts ? parts.n : null
  const [shown, setShown] = useState(() => (target === null || motionOff() ? target : 0))
  const from = useRef(shown)
  const first = useRef(true)

  useEffect(() => {
    if (target === null) return
    if (motionOff()) {
      from.current = target
      setShown(target)
      return
    }
    const start = from.current ?? 0
    const dur = first.current ? 750 : 300
    first.current = false
    if (start === target) return
    let raf
    const t0 = performance.now()
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur)
      const v = start + (target - start) * ease(p)
      from.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])

  if (!parts) return value
  return joinNumber(parts, shown ?? target)
}
