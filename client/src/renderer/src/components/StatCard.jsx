import Icon from './Icon'
import { translate } from '../i18n'

// Ô số liệu ở trang chủ: biểu tượng màu + nhãn ở đầu, số lớn, một dòng phụ giải thích con số; bấm được thì có mũi tên.
// tone: 'g' xanh lá | 'r' đỏ | 'b' xanh dương | 'v' tím | 'a' cam | 't' xanh ngọc. alert → nền đỏ nhạt, số đỏ, chấm nhấp nháy.
// Giữ class .tile.rt và .val cho các chỗ đang đọc số (test, phím tắt).
export function HomeTile({ value, label, sub, icon = 'chart', tone = 'b', alert, onClick, title }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={'tile rt htile ' + tone + (alert ? ' alert' : '') + (onClick ? ' click' : '')}
      onClick={onClick}
      title={title}
      {...(onClick ? { type: 'button' } : {})}
    >
      <span className="htile-h">
        <span className="htile-ic">
          <Icon name={icon} />
        </span>
        <span className="tl">{translate(label)}</span>
        {alert && <span className="htile-ping" aria-hidden="true" />}
        {onClick && <Icon name="arrow-up-right" className="htile-go" />}
      </span>
      <b className="num rt-n val htile-n">{value}</b>
      {sub ? <span className="htile-s">{sub}</span> : <span className="htile-s">&nbsp;</span>}
    </Tag>
  )
}

export default function StatCard(props) {
  return <HomeTile {...props} />
}

// Ô số liệu kiểu .kpi của bản mẫu (trang Báo cáo): icon + nhãn, số lớn, dòng phụ.
// c: màu icon ('p' | 'n' | 'd' | 'w' | 's').
export function Kpi({ c = 'p', icon, label, value, go, alert, onClick }) {
  return (
    <button type="button" className={'kpi' + (alert ? ' alert' : '')} onClick={onClick} style={onClick ? undefined : { cursor: 'default' }}>
      <div className="kpi-h">
        <div className={'ico ' + c}>
          <Icon name={icon} />
        </div>
        {translate(label)}
      </div>
      <div className="val num">{value}</div>
      {go && <span className="go">{go}</span>}
    </button>
  )
}
