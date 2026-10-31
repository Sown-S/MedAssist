import { useCallback, useEffect, useRef, useState } from 'react'

// Bọc 1 thao tác (lưu, thu tiền, chốt đơn...) để KHÔNG chạy 2 lần khi người dùng bấm đúp hoặc nhấn phím tắt liên tiếp.
// Hàm trả về Promise → khoá cho tới khi xong, busy = true trong lúc chờ. Hàm đồng bộ (store cục bộ hiện tại) → chạy thẳng,
// nên khi ghép API thật chỉ cần thêm async/await vào hàm, không phải sửa nút.
//   const [pay, paying] = useAsyncAction(handleConfirm)
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
