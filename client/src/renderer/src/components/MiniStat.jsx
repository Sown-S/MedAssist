import Icon from './Icon'
import { translate } from '../i18n'

// Ô tóm tắt nhỏ theo bản mẫu (.summary > .sum): icon vuông bên trái, số và nhãn bên phải.
// tone: 'p' xanh dương (mặc định) | 's' xanh lá | 'w' cam | 'd' đỏ | 'n' xám. onClick → ô bấm được để lọc.
// eslint-disable-next-line no-unused-vars
export function MiniStat({ icon = 'chart', value, label, tone = 'p', alert, active, onClick, mono, children }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={'sum t-' + tone + (alert ? ' alert' : '') + (onClick ? ' click' : '') + (active ? ' on' : '')}
      onClick={onClick}
      {...(onClick ? { type: 'button', 'aria-pressed': !!active } : {})}
    >
      <div className={'ico ' + tone}>
        <Icon name={icon} />
      </div>
      <div>
        <b className="num">{value}</b>
        <span>{typeof label === 'string' ? translate(label) : label}</span>
        {children}
      </div>
    </Tag>
  )
}

export function MiniStats({ children }) {
  return <div className="summary">{children}</div>
}
