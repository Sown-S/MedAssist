import { useEffect, useRef, useState } from 'react'

// Chống “chớp”: chỉ hiện khi `on` kéo dài quá `delay` ms, đã hiện thì giữ ít nhất `minShow` ms.
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
