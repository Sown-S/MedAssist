import { useEffect, useRef, useState } from 'react'

// Chống "chớp" của spinner/skeleton: chỉ bật khi `on` kéo dài quá `delay` ms (thao tác nhanh thì không hiện gì),
// và một khi đã hiện thì giữ ít nhất `minShow` ms để mắt kịp thấy thay vì loé lên rồi tắt.
export function useDelayedFlag(on, delay = 300, minShow = 400) {
  const [shown, setShown] = useState(false)
  const since = useRef(0)

  useEffect(() => {
    if (on && !shown) {
      const t = setTimeout(() => {
        since.current = Date.now()
        setShown(true)
      }, delay)
      return () => clearTimeout(t)
    }
    if (!on && shown) {
      const t = setTimeout(() => setShown(false), Math.max(0, minShow - (Date.now() - since.current)))
      return () => clearTimeout(t)
    }
  }, [on, shown, delay, minShow])

  return shown
}
