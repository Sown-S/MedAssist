import { useAsyncAction } from '../hooks/useAsyncAction'
import { useDelayedFlag } from '../hooks/useDelayedFlag'

// Nút dùng cho thao tác ghi dữ liệu. onClick trả về Promise → nút tự khoá (chống bấm đúp tạo 2 hoá đơn / 2 đơn thuốc)
// và hiện spinner nếu chờ quá 300ms. Nút submit của form: truyền loading={busy} từ trang cha.
// className giữ nguyên như <button> thường (btn btn-primary...), mặc định type="button".
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
