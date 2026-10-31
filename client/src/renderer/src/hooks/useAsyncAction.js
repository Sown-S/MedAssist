import { useCallback, useEffect, useRef, useState } from 'react'

// Chống chạy hai lần khi bấm đúp / nhấn phím tắt liên tiếp: hàm trả về Promise thì khoá tới khi xong.
export function useAsyncAction(fn) {
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })

  const run = useCallback((...args) => {
    if (lock.current) return
    const r = fnRef.current?.(...args)
    if (!r || typeof r.then !== 'function') return r
    lock.current = true
    setBusy(true)
    return r.finally(() => {
      lock.current = false
      setBusy(false)
    })
  }, [])

  return [run, busy]
}
