import Icon from './Icon'
import { translate } from '../i18n'

// Ô tóm tắt nhỏ theo mẫu: icon vuông bên trái, số và nhãn bên phải.
// tone: 'p' xanh dương (mặc định) | 's' xanh lá | 'w' cam | 'd' đỏ | 'n' xám. onClick → ô bấm được để lọc.
export function MiniStat({ icon = 'chart', value, label, tone = 'p', alert, active, onClick, mono, children }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={'inv-stat t-' + tone + (onClick ? '' : ' static') + (alert ? ' alert' : '') + (active ? ' active' : '')}
      onClick={onClick}
      {...(onClick ? { type: 'button', 'aria-pressed': !!active } : {})}
    >
      <span className="is-ico">
        <Icon name={icon} />
      </span>
      <span className={'val' + (mono ? ' mono' : '')}>{value}</span>
      <span className="lbl">{typeof label === 'string' ? translate(label) : label}</span>
      {children}
    </Tag>
  )
}

export function MiniStats({ children }) {
  return <div className="inv-stats">{children}</div>
}
