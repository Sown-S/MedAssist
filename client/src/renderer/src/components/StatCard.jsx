import Icon from './Icon'
import { translate } from '../i18n'

// Ô số liệu kiểu .tile.rt của bản mẫu: nhãn trên, số dưới trái, icon tròn góc dưới phải.
// tone: 'g' (xanh lá) | 'r' (đỏ) | mặc định xanh dương; alert = true → viền và số màu đỏ.
export default function StatCard({ value, label, icon = 'chart', tone, alert, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={'tile rt ' + (tone || 'b') + (alert ? ' alert' : '')} onClick={onClick} style={onClick ? undefined : { cursor: 'default' }}>
      <span className="tl">{translate(label)}</span>
      <div className="rt-b">
        <b className="num rt-n val">{value}</b>
        <span className="chip">
          <Icon name={icon} />
        </span>
      </div>
    </Tag>
  )
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
