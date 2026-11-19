import { useEffect, useState } from 'react'
import Icon, { Logo } from './Icon'
import ServerAddress from './ServerAddress'
import { translate } from '../i18n'
import { getBaseUrl } from '../api/serverConfig'
import { version as appVersion } from '../../../../package.json'

// Màn khởi động: cùng hình với khung tĩnh trong index.html (hiện ngay khi bật app), chờ GET /health lần đầu.
// Tới được máy chủ → vào app; không tới được → nút Thử lại / Đổi địa chỉ máy chủ, hoặc vẫn mở app ở chế độ chỉ đọc.
const TIMEOUT_MS = 4000
// Màn khởi động hiện ít nhất ngần này (tính từ lúc mở cửa sổ) để không bị nháy qua quá nhanh.
const MIN_SHOW_MS = 1400

async function reach() {
  try {
    const res = await fetch(getBaseUrl() + '/health', { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
    // /health trả 503 khi máy chủ chạy nhưng CSDL lỗi.
    return res.ok ? 'ok' : res.status === 503 ? 'db' : 'fail'
  } catch {
    return 'fail'
  }
}

export default function BootGate({ children }) {
  const [state, setState] = useState('checking') // checking | ok | fail | db
  const [editing, setEditing] = useState(false)

  async function check(first) {
    setState('checking')
    const [r] = await Promise.all([reach(), first ? new Promise((ok) => setTimeout(ok, Math.max(0, MIN_SHOW_MS - performance.now()))) : null])
    setState(r)
  }
  useEffect(() => {
    check(true)
  }, [])

  if (state === 'ok') return children
  return (
    <div className="boot" role="status" aria-live="polite">
      <div className="boot-card">
        <div className={'boot-mark' + (state === 'checking' ? '' : ' still')}>
          <Logo />
        </div>
        <div className="boot-logo">
          Med<b>Assist</b>
        </div>
        <p className="boot-tag">{translate('Outpatient care support for the clinic')}</p>
        {state === 'checking' ? (
          <>
            <div className="boot-bar">
              <i />
            </div>
            <div className="boot-msg">{translate('Connecting to the clinic server…')}</div>
          </>
        ) : (
          <>
            <div className={'banner ' + (state === 'db' ? 'w' : 'd')} style={{ textAlign: 'left' }}>
              <Icon name="wifi-off" />
              <div className="txt">
                <b>{translate(state === 'db' ? 'The server is running but its database is not ready' : 'Cannot reach the clinic server')}</b>
                <span className="num">{getBaseUrl()}</span>
              </div>
            </div>
            <div className="boot-acts">
              <button className="btn btn-primary" onClick={() => check()}>
                <Icon name="refresh-cw" />
                {translate('Try again')}
              </button>
              <button className="btn btn-outline" onClick={() => setEditing(!editing)} aria-expanded={editing}>
                <Icon name="server" />
                {translate('Change server address')}
              </button>
            </div>
            {editing && (
              <div className="boot-addr">
                <ServerAddress variant="login" onSaved={() => check()} />
              </div>
            )}
            <button className="link-btn small" onClick={() => setState('ok')}>
              {translate('Open the app without a connection (read-only)')}
            </button>
          </>
        )}
      </div>
      <div className="boot-foot">MedAssist {appVersion}</div>
    </div>
  )
}
