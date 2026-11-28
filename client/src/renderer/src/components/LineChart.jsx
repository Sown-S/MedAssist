import Icon from './Icon'
import { translate } from '../i18n'

// Biểu đồ đường theo mẫu: số của điểm cuối, chênh lệch so với điểm trước, nhãn trên từng điểm.
// points: [{ label, value }] theo thứ tự thời gian; fmt định dạng số (tiền...).
export default function LineChart({ points, fmt = String, height = 200, compareLabel = 'vs previous day', emptyText = 'No data in this period' }) {
  if (!points.length || points.every((p) => !p.value)) return <div className="lc-empty">{translate(emptyText)}</div>
  const vs = points.map((p) => p.value)
  const max = Math.max(...vs) || 1
  const n = points.length
  const x = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100)
  const y = (v) => (1 - v / (max * 1.15)) * 100
  const line = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(2) + ' ' + y(p.value).toFixed(2)).join(' ')
  const last = vs[n - 1]
  const prev = n > 1 ? vs[n - 2] : null
  const d = prev == null ? 0 : last - prev
  const up = d >= 0
  const pct = prev ? Math.abs((d / prev) * 100).toFixed(1).replace('.', ',') : null
  return (
    <>
      <div className="lc-h">
        <b>{fmt(last)}</b>
        {prev != null && (
          <span className={'lc-d ' + (up ? 'up' : 'down')}>
            <Icon name="trending" />
            {(up ? '+' : '−') + fmt(Math.abs(d))}
            {pct != null && ` (${pct}%)`}
          </span>
        )}
        {prev != null && <span className="muted">{translate(compareLabel)}</span>}
      </div>
      <div className="lc" style={{ height }}>
        <div className="lc-grid">
          <i />
          <i />
          <i />
          <i />
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--primary)' }} stopOpacity=".22" />
              <stop offset="1" style={{ stopColor: 'var(--primary)' }} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={line + ' L100 100 L0 100 Z'} fill="url(#lcg)" />
          <path className="lc-l" d={line} vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((p, i) => (
          <span key={p.label} className={'lc-p' + (i === n - 1 ? ' last' : '')} style={{ left: x(i) + '%', top: y(p.value) + '%' }} title={p.label + ': ' + fmt(p.value)}>
            {n <= 14 && <em>{fmt(p.value)}</em>}
          </span>
        ))}
      </div>
      <div className="lc-x">
        {points.map((p, i) => (
          <span key={p.label}>{n <= 14 || i % Math.ceil(n / 10) === 0 || i === n - 1 ? p.label : ''}</span>
        ))}
      </div>
    </>
  )
}
