import { Component } from 'react'
import Icon from './Icon'

// Lưới bắt lỗi giao diện: một màn gặp lỗi JavaScript lúc dựng thì chỉ màn đó hiện thông báo, không làm trắng cả cửa sổ.
// resetKey đổi (VD chuyển sang trang khác) → tự dựng lại phần bên trong. Lỗi trong hàm xử lý sự kiện (onClick, gọi API)
// không đi qua đây — những chỗ đó vẫn báo bằng toast / dòng lỗi như cũ.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[MedAssist] Lỗi giao diện:', error, info?.componentStack)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="card" role="alert" style={{ margin: 24 }}>
        <div className="empty-state">
          <Icon name="alert" />
          <b>Something went wrong on this screen</b>
          <span>Data already saved is not affected. Try again, or reload the app if it keeps happening.</span>
          <code className="ai-small ai-soft">{String(error?.message ?? error)}</code>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => this.setState({ error: null })}>
              <Icon name="repeat" /> Try again
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
              Reload the app
            </button>
          </div>
        </div>
      </div>
    )
  }
}
