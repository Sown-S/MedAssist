import { translate } from '../i18n'

// Khung chờ tải (skeleton) thay cho chữ “Đang tải…”: vài vạch xám nhấp nháy đúng chỗ nội dung sẽ hiện.
// rows: số hàng; cols: số cột mỗi hàng (dạng bảng). Có aria-busy + chữ ẩn cho trình đọc màn hình.
// label: dòng chữ hiện phía trên (vd “Đang tải bản phát hành”), kèm ba chấm nhảy lên xuống.
export const LoadingDots = () => (
  <span className="dots" aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
)

export default function Skeleton({ rows = 4, cols = 3, compact, label }) {
  return (
    <div className={'skel' + (compact ? ' compact' : '')} aria-busy="true" role="status">
      {label ? (
        <div className="skel-label">
          {translate(label)}
          <LoadingDots />
        </div>
      ) : (
        <span className="sr-only">{translate('Loading…')}</span>
      )}
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
