import { useEffect, useState } from 'react'
import { version as appVersion } from '../../../../package.json'
import Icon from './Icon'
import { translate } from '../i18n'
import { useServerVersion } from '../api/connectivity'

const clean = (v) => String(v ?? '').trim().replace(/^v/i, '')
// So sánh 0.2.10 > 0.2.9 theo từng số; phần không phải số coi như 0.
export function compareVersions(a, b) {
  const pa = clean(a).split('.').map((x) => parseInt(x, 10) || 0)
  const pb = clean(b).split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

// Ẩn trong phiên làm việc này (theo đúng cặp phiên bản): mở lại app hoặc đổi phiên bản thì hiện lại.
const DISMISS_KEY = 'medassist_version_notice_hidden'
const readHidden = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) || ''
  } catch {
    return ''
  }
}
const writeHidden = (v) => {
  try {
    sessionStorage.setItem(DISMISS_KEY, v)
  } catch {
    /* không lưu được thì chỉ ẩn tới khi tải lại */
  }
}

// Hai thông báo về phiên bản, chỉ báo, không tự cài:
// 1. Phiên bản ứng dụng khác máy chủ (đọc /health, chạy được trong LAN không có Internet). Nói rõ bên nào cũ hơn và ai cần làm gì:
//    ứng dụng cũ hơn → người dùng tải bản mới; máy chủ cũ hơn → báo quản trị viên cập nhật máy chủ.
// 2. GitHub có bản mới hơn (main process kiểm 1 lần mỗi lần mở app; mất mạng hay lỗi thì không hiện gì).
// Cả hai là thẻ thông báo cùng một kiểu: biểu tượng, tiêu đề, một câu giải thích, cặp phiên bản, nút hành động và nút ẩn.
// margin: lề của khối; màn đăng nhập đặt sát trên khung đăng nhập.
export default function VersionBanners({ margin = '12px 24px 0' }) {
  const [latest, setLatest] = useState(null)
  const [hidden, setHidden] = useState(readHidden)
  const serverVersion = useServerVersion()

  useEffect(() => {
    let alive = true
    Promise.resolve(window.api?.updates?.check?.())
      .then((r) => alive && r?.version && setLatest(r.version))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const app = clean(appVersion)
  const server = clean(serverVersion)
  const cmp = server ? compareVersions(app, server) : 0
  const mismatchKey = `mismatch:${app}:${server}`
  const latestKey = `latest:${clean(latest)}`
  const showMismatch = cmp !== 0 && !hidden.includes(mismatchKey)
  const showLatest = !!latest && compareVersions(latest, app) > 0 && !hidden.includes(latestKey)
  if (!showMismatch && !showLatest) return null

  const hide = (key) => {
    const next = [hidden, key].filter(Boolean).join('|')
    writeHidden(next)
    setHidden(next)
  }
  const openReleases = () => window.api?.updates?.openReleases?.()
  const appOlder = cmp < 0

  return (
    <div className="vnotes" style={{ margin }}>
      {showMismatch && (
        <div className={'vnote ' + (appOlder ? 'warn' : 'info')} role="status">
          <span className="vnote-ic">
            <Icon name={appOlder ? 'download' : 'server'} />
          </span>
          <div className="vnote-body">
            <b className="vnote-t">{translate(appOlder ? 'A newer app version is available' : 'The clinic server is not up to date')}</b>
            <p className="vnote-d">
              {translate(
                appOlder
                  ? 'The server has moved to a newer version. Update the app so your work is saved correctly.'
                  : 'Some new features may not work yet. Ask your administrator to update the server.'
              )}
            </p>
            <div className="vnote-foot">
              <div className="vnote-vers" aria-label={translate('Versions')}>
                <span className={'vchip' + (appOlder ? ' old' : '')}>
                  <Icon name="monitor" />
                  {translate('In the app')} <b className="num">{app}</b>
                </span>
                <Icon name="arrow-left-right" className="vnote-sep" />
                <span className={'vchip' + (appOlder ? '' : ' old')}>
                  <Icon name="server" />
                  {translate('On the server')} <b className="num">{server}</b>
                </span>
              </div>
              {appOlder && (
                <button type="button" className="btn btn-primary btn-sm" onClick={openReleases}>
                  <Icon name="download" />
                  {translate('Get the new version')}
                </button>
              )}
            </div>
          </div>
          <button type="button" className="vnote-x" onClick={() => hide(mismatchKey)} aria-label={translate('Hide this notice')} title={translate('Hide until the app is reopened')}>
            <Icon name="x" />
          </button>
        </div>
      )}
      {showLatest && (
        <div className="vnote info" role="status">
          <span className="vnote-ic">
            <Icon name="sparkles" />
          </span>
          <div className="vnote-body">
            <b className="vnote-t">{translate(`MedAssist ${clean(latest)} is available`)}</b>
            <p className="vnote-d">
              {translate('You are on version')} <b className="num">{app}</b>. {translate('Update when it is convenient — your data stays on the clinic server.')}
            </p>
            <div className="vnote-foot">
              <span />
              <button type="button" className="btn btn-outline btn-sm" onClick={openReleases}>
                {translate('See what’s new')}
              </button>
            </div>
          </div>
          <button type="button" className="vnote-x" onClick={() => hide(latestKey)} aria-label={translate('Hide this notice')} title={translate('Hide until the app is reopened')}>
            <Icon name="x" />
          </button>
        </div>
      )}
    </div>
  )
}
