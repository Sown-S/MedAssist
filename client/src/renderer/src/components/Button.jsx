import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useDelayedFlag } from '../hooks/useDelayedFlag'

// onClick trả về Promise → nút tự khoá (chống bấm đúp tạo hai hoá đơn / hai đơn) và hiện spinner nếu chờ quá 300 ms.
// Nút submit của form: truyền loading từ trang cha. Xong không lỗi → dấu ✓ hiện khoảng 1 giây ngay trên nút.
export default function Button({ onClick, loading = false, disabled = false, className = 'btn btn-primary', type = 'button', children, ...rest }) {
  const [run, running] = useAsyncAction(onClick)
  const busy = loading || running
  const spin = useDelayedFlag(busy)
  const [ok, setOk] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  function click(...args) {
    const r = run(...args)
    if (r && typeof r.then === 'function')
      r.then(
        (v) => {
          if (v === false) return
          setOk(true)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setOk(false), 1000)
        },
        () => {}
      )
    return r
  }
  return (
    <button {...rest} type={type} className={className + (ok ? ' is-done' : '')} disabled={disabled || busy || spin} aria-busy={busy || spin || undefined} onClick={onClick && click}>
      {spin ? <span className="spinner btn-spinner" aria-hidden="true" /> : ok && <Icon name="check" className="done-ic" />}
      {children}
    </button>
  )
}
