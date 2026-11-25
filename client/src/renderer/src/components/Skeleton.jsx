import { translate } from '../i18n'

// Khung chờ tải (skeleton) thay cho chữ “Đang tải…”: vài vạch xám nhấp nháy đúng chỗ nội dung sẽ hiện.
// rows: số hàng; cols: số cột mỗi hàng (dạng bảng). Có aria-busy + chữ ẩn cho trình đọc màn hình.
// Ba chấm nhảy lên xuống sau chữ “Đang tải …”.
export const LoadingDots = () => (
  <span className="dots" aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
)

// label (trang tri thức): chỉ hiện dòng “Đang tải …” kèm ba chấm nhảy, không vẽ các vạch mờ; dữ liệu về thì các dòng
// hiện lần lượt (CSS .kb-live). Không có label: khung vạch mờ như cũ.
export default function Skeleton({ rows = 4, cols = 3, compact, label }) {
  if (label)
    return (
      <div className="skel-wait" aria-busy="true" role="status">
        {translate(label)}
        <LoadingDots />
      </div>
    )
  return (
    <div className={'skel' + (compact ? ' compact' : '')} aria-busy="true" role="status">
      <span className="sr-only">{translate('Loading…')}</span>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="skel-row">
          {Array.from({ length: cols }, (_, c) => (
            <i key={c} style={{ flex: c === 0 ? 2 : 1, opacity: 1 - r * 0.12 }} />
          ))}
        </div>
      ))}
    </div>
  )
}
