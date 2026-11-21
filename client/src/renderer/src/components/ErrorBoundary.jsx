import { Component } from 'react'
import Icon from './Icon'

// Một màn lỗi lúc dựng chỉ hiện thông báo ở màn đó, không làm trắng cả cửa sổ; resetKey đổi thì dựng lại.
// Lỗi trong hàm xử lý sự kiện (onClick, gọi API) không đi qua đây.
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
      <div className="card m-24" role="alert">
        <div className="empty">
          <div className="ill">
            <Icon name="alert" />
          </div>
          <b>Something went wrong on this screen</b>
          <span>Data already saved is not affected. Try again, or reload the app if it keeps happening.</span>
          <code className="small muted">{String(error?.message ?? error)}</code>
          <div className="d-flex gap-8 mt-12">
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
