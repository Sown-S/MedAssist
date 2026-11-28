// Nhãn trạng thái: tone = success | warning | danger | info | neutral (màu theo token --success, --warning…).
const TONES = { success: 'b-success', warning: 'b-warning', danger: 'b-danger', info: 'b-info', neutral: 'b-neutral' }

export default function Badge({ tone = 'neutral', className = '', children, ...rest }) {
  return (
    <span {...rest} className={'badge ' + (TONES[tone] ?? tone) + (className ? ' ' + className : '')}>
      {children}
    </span>
  )
}
