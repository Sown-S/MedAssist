// tone: 'amber' | 'red' — màu chấm; alert = true → cả ô nổi bật màu đỏ.
export default function StatCard({ value, label, tone, alert }) {
  return (
    <div className={'stat-card' + (alert ? ' alert' : '')}>
      <div className={'dot' + (tone ? ' ' + tone : '')} />
      <div>
        <div className="val">{value}</div>
        <div className="lbl">{label}</div>
      </div>
    </div>
  )
}
