import { useAsyncAction } from '../hooks/useAsyncAction'
import { useDelayedFlag } from '../hooks/useDelayedFlag'

// onClick trả về Promise → nút tự khoá (chống bấm đúp tạo hai hoá đơn / hai đơn) và hiện spinner nếu chờ quá 300 ms.
// Nút submit của form: truyền loading từ trang cha.
export default function Button({ onClick, loading = false, disabled = false, className = 'btn btn-primary', type = 'button', children, ...rest }) {
  const [run, running] = useAsyncAction(onClick)
  const busy = loading || running
  const spin = useDelayedFlag(busy)
  return (
    <button {...rest} type={type} className={className} disabled={disabled || busy || spin} aria-busy={busy || spin || undefined} onClick={onClick && run}>
      {spin && <span className="spinner btn-spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}
