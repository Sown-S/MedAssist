import Icon from './Icon'
import { translate } from '../i18n'

// Ô số liệu: nhãn trên, số dưới trái, icon tròn góc dưới phải.
// tone: 'g' (xanh lá) | 'r' (đỏ) | mặc định xanh dương; alert = true → viền và số màu đỏ.
export default function StatCard({ value, label, icon = 'chart', tone, alert, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={'stat-card tile rt ' + (tone || 'b') + (alert ? ' alert' : '')} onClick={onClick}>
      <span className="tl lbl">{translate(label)}</span>
      <span className="rt-b">
        <b className="rt-n val">{value}</b>
        <span className="chip">
          <Icon name={icon} />
        </span>
      </span>
    </Tag>
  )
}
