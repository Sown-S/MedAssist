import { useState } from 'react'
import Icon from './Icon'

// Mỗi thẻ bệnh nhân trong hàng chờ tự quản lý trạng thái mở/đóng của chính nó bằng useState.
// ticket = số thứ tự (hiện to bên trái); wait = { label, level: 'ok' | 'warn' | 'long' } — thời gian đã chờ.
// badges = các nhãn thêm ở bên phải (VD dị ứng); extra = nội dung chèn trên các dòng chi tiết (VD cảnh báo dị ứng).
export default function PatientQueueCard({ ticket, name, meta, time, wait, priority, badges, extra, details, actions }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={'p-card' + (open ? ' open' : '')} onClick={() => setOpen((v) => !v)}>
      <div className="p-head">
        {ticket != null && <span className="p-ticket">{String(ticket).padStart(3, '0')}</span>}
        <div className="p-info">
          <span className="p-name">{name}</span>
          <span className="p-meta">{meta}</span>
        </div>
        <div className="p-right">
          {badges}
          {priority && <span className="flag-priority"><Icon name="zap" /> Priority</span>}
          {wait ? <span className={'p-wait ' + wait.level}>{wait.label}</span> : <span className="time">{time}</span>}
          <span className="chevron">▸</span>
        </div>
      </div>
      <div className="p-detail">
        <div className="p-detail-in">
          {extra}
          {details.map((d) => (
            <div className="row" key={d.label}>
              <span>{d.label}</span>
              <b>{d.value}</b>
            </div>
          ))}
          {actions && (
            <div className="p-detail-actions" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
