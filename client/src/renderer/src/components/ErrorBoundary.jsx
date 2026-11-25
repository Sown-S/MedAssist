import { Component } from 'react'
import Icon from './Icon'
import EmptyState from './ui/EmptyState'
import { reportError, canExportDiagnostics, exportDiagnostics } from '../lib/errorReport'

// Một màn lỗi lúc dựng chỉ hiện thông báo ở màn đó, không làm trắng cả cửa sổ; resetKey đổi thì dựng lại.
// inline: bọc một phần trong trang (gợi ý AI, biểu đồ, cảnh báo cụm ca…) — phần đó lỗi thì chỉ hiện một dòng báo,
// phần còn lại của trang (khám bệnh, kê đơn) vẫn dùng được.
// Lỗi trong hàm xử lý sự kiện (onClick, gọi API) không đi qua đây.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[MedAssist] Lỗi giao diện:', error, info?.componentStack)
    reportError(error, { componentStack: info?.componentStack?.slice(0, 1500), page: location.hash })
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.inline)
      return (
        <div className="banner w" role="alert">
          <Icon name="triangle-alert" />
          <div className="txt">
            <b>{this.props.label ?? 'This part could not be shown.'}</b> The rest of the screen still works.
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => this.setState({ error: null })}>
            <Icon name="repeat" /> Try again
          </button>
        </div>
      )
    return (
      <div className="card m-24" role="alert">
        <EmptyState icon="alert" title="Something went wrong on this screen" text="Data already saved is not affected. Try again, or reload the app if it keeps happening.">
          <code className="small muted">{String(error?.message ?? error)}</code>
          <div className="d-flex gap-8 mt-12">
            <button className="btn btn-primary btn-sm" onClick={() => this.setState({ error: null })}>
              <Icon name="repeat" /> Try again
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
              Reload the app
            </button>
            {canExportDiagnostics() && (
              <button className="btn btn-ghost btn-sm" onClick={() => exportDiagnostics()}>
                <Icon name="download" /> Save error details
              </button>
            )}
          </div>
        </EmptyState>
      </div>
    )
  }
}
