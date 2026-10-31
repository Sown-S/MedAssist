import Icon from './Icon'
export function LoadingBlock({ text = 'Loading...' }) {
  return (
    <div className="card" style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
      {text}
    </div>
  )
}

// Màn mà server chưa cho vai trò này đọc dữ liệu (chạy thật): báo rõ lý do thay vì hiện dữ liệu mẫu trên máy.
export function ServerPending({ title, children, action }) {
  return (
    <div className="card">
      <div className="empty-state">
        <Icon name="lock" />
        <b>{title}</b>
        <span>{children}</span>
        {action && <div style={{ marginTop: 12 }}>{action}</div>}
      </div>
    </div>
  )
}

export function ErrorBlock({ message }) {
  return (
    <div className="warn-banner danger show">
      <div className="icon">
  <Icon name="ban" />
</div>
      <div className="txt">
        <b>Failed to load data</b>
        {message}
      </div>
    </div>
  )
}
