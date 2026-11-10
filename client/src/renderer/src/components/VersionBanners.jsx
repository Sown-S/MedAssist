import { useEffect, useState } from 'react'
import { version as appVersion } from '../../../../package.json'
import Icon from './Icon'
import { translate } from '../i18n'
import { useServerVersion } from '../api/connectivity'

const clean = (v) => String(v ?? '').trim().replace(/^v/i, '')

// Hai thông báo về phiên bản, chỉ báo, không tự cài:
// 1. GitHub có bản mới hơn (main process kiểm 1 lần mỗi lần mở app; mất mạng hay lỗi thì không hiện gì).
// 2. Version client khác máy chủ (đọc từ /health) — chạy được trong LAN không có Internet.
// margin: lề của banner; màn đăng nhập đặt banner sát trên khung đăng nhập.
export default function VersionBanners({ margin = '12px 24px 0' }) {
  const [latest, setLatest] = useState(null)
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

  const mismatch = serverVersion && clean(serverVersion) !== clean(appVersion)
  if (!latest && !mismatch) return null

  return (
    <>
      {mismatch && (
        <div className="warn-banner show caution" role="status" style={{ margin }}>
          <div className="icon">
            <Icon name="alert" />
          </div>
          <div className="txt">
            <b>{translate(`App version (${clean(appVersion)}) differs from the server (${clean(serverVersion)}), update to avoid errors`)}</b>
          </div>
        </div>
      )}
      {latest && (
        <div className="warn-banner show caution version-banner" role="status" style={{ margin }}>
          <div className="icon">
            <Icon name="bulb" />
          </div>
          <div className="txt">
            <b>{translate(`Version ${latest} is available`)}</b>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => window.api?.updates?.openReleases?.()}>
            Open release page
          </button>
        </div>
      )}
    </>
  )
}
