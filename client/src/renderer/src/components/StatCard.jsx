// Đây chính là bước "tách khối lặp trong mockup thành component React" đã nói ở lộ trình học.
// Trong file HTML cũ, mỗi ô số liệu (Chờ khám, Chờ thanh toán...) là 1 đoạn <div> chép tay.
// Giờ chỉ cần 1 component, truyền props khác nhau để tái sử dụng.
// tone: 'amber' | 'red' — màu chấm; alert = true → cả ô nổi bật màu đỏ (VD có ca cờ đỏ).
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
