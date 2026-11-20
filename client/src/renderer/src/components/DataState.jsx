import Icon from './Icon'
import Skeleton from './Skeleton'
import { translate } from '../i18n'

// Trạng thái dữ liệu dùng chung: đang tải (khung skeleton) và lỗi tải (banner đỏ, có nút thử lại nếu truyền onRetry).
export function LoadingBlock({ rows = 5, cols = 4 }) {
  return (
    <div className="card">
      <Skeleton rows={rows} cols={cols} />
    </div>
  )
}

export function ErrorBlock({ message, onRetry, title }) {
  return (
    <div className="banner d" role="alert">
      <Icon name="circle-alert" />
      <div className="txt">
        <b>{title ?? translate('Failed to load data')}</b>
        {message}
      </div>
      {onRetry && (
        <button className="btn btn-outline btn-sm" onClick={onRetry}>
          <Icon name="refresh-cw" />
          {translate('Try again')}
        </button>
      )}
    </div>
  )
}

// Thông báo lỗi ngắn trong form/hộp thoại: cùng kiểu banner của bản mẫu (icon + chữ), tone 'd' (lỗi) hoặc 'w' (cảnh báo).
export function ErrorNote({ children, tone = 'd', style }) {
  if (!children) return null
  return (
    <div className={'banner ' + tone} role="alert" style={style}>
      <Icon name={tone === 'w' ? 'triangle-alert' : 'circle-alert'} />
      <div className="txt">{children}</div>
    </div>
  )
}
