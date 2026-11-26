import { useEffect, useRef, useState } from 'react'
import { version as appVersion } from '../../../../package.json'
import Icon from './Icon'
import { translate } from '../i18n'
import { useServerVersion } from '../api/connectivity'

const clean = (v) => String(v ?? '').trim().replace(/^v/i, '')
// So sánh 0.2.10 > 0.2.9 theo từng số; phần không phải số coi như 0.
function compareVersions(a, b) {
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

// Trạng thái thông báo phiên bản, dùng chung cho thẻ ở màn đăng nhập và chuông trên thanh trên cùng:
// 1. Phiên bản ứng dụng khác máy chủ (đọc /health, chạy được trong LAN không có Internet). Nói rõ bên nào cũ hơn:
//    ứng dụng cũ hơn → người dùng tải bản mới; máy chủ cũ hơn → báo quản trị viên cập nhật máy chủ.
// 2. GitHub có bản mới hơn (main process kiểm 1 lần mỗi lần mở app; mất mạng hay lỗi thì không hiện gì).
// 3. Máy vừa được cập nhật (phiên bản khác lần mở trước): báo một lần "đã cập nhật lên X", kèm đường tới các bản trước
//    nếu bản mới có lỗi (cài lại bản cũ — xem client/README.md).
// keys: khoá của các thông báo đang hiện (để chuông biết đã xem hay chưa); hide(key): ẩn tới lần mở app sau.
const LAST_KEY = 'medassist_last_version'
// Đọc phiên bản lần mở trước một lần cho cả phiên rồi ghi phiên bản hiện tại.
let previousVersion
function readPrevious() {
  if (previousVersion !== undefined) return previousVersion
  try {
    previousVersion = localStorage.getItem(LAST_KEY)
    localStorage.setItem(LAST_KEY, clean(appVersion))
  } catch {
    previousVersion = null
  }
  return previousVersion
}

export function useVersionNotices() {
  const [latest, setLatest] = useState(null)
  const [notes, setNotes] = useState('')
  const [hidden, setHidden] = useState(readHidden)
  const serverVersion = useServerVersion()

  useEffect(() => {
    let alive = true
    Promise.resolve(window.api?.updates?.check?.())
      .then((r) => alive && r?.version && (setLatest(r.version), setNotes(r.notes ?? '')))
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
  const mismatch = cmp !== 0 && !hidden.includes(mismatchKey) ? { key: mismatchKey, app, server, appOlder: cmp < 0 } : null
  const update = latest && compareVersions(latest, app) > 0 && !hidden.includes(latestKey) ? { key: latestKey, app, latest: clean(latest), notes } : null
  const prev = readPrevious()
  const updatedKey = `updated:${prev}:${app}`
  const updated = prev && compareVersions(prev, app) !== 0 && !hidden.includes(updatedKey) ? { key: updatedKey, from: clean(prev), to: app } : null
  const hide = (key) => {
    const next = [readHidden(), key].filter(Boolean).join('|')
    writeHidden(next)
    setHidden(next)
  }
  return { mismatch, update, updated, hide, keys: [mismatch?.key, update?.key, updated?.key].filter(Boolean) }
}

const openReleases = () => window.api?.updates?.openReleases?.()
const openAllReleases = () => window.api?.updates?.openAllReleases?.()

// Danh sách thẻ thông báo (biểu tượng, tiêu đề, một câu giải thích, cặp phiên bản, nút hành động, nút ẩn).
export function VersionNoticeList({ notices, onAction }) {
  const { mismatch, update, updated, hide } = notices
  const act = () => {
    openReleases()
    onAction?.()
  }
  return (
    <>
      {mismatch && (
        <div className={'vnote ' + (mismatch.appOlder ? 'warn' : 'info')} role="status">
          <span className="vnote-ic">
            <Icon name={mismatch.appOlder ? 'download' : 'server'} />
          </span>
          <div className="vnote-body">
            <b className="vnote-t">{translate(mismatch.appOlder ? 'A newer app version is available' : 'The clinic server is not up to date')}</b>
            <p className="vnote-d">
              {translate(mismatch.appOlder ? 'The server has moved to a newer version. Update the app so your work is saved correctly.' : 'Some new features may not work yet. Ask your administrator to update the server.')}
            </p>
            <div className="vnote-foot">
              <div className="vnote-vers" aria-label={translate('Versions')}>
                <span className={'vchip' + (mismatch.appOlder ? ' old' : '')}>
                  <Icon name="monitor" />
                  {translate('In the app')} <b className="num">{mismatch.app}</b>
                </span>
                <Icon name="arrow-left-right" className="vnote-sep" />
                <span className={'vchip' + (mismatch.appOlder ? '' : ' old')}>
                  <Icon name="server" />
                  {translate('On the server')} <b className="num">{mismatch.server}</b>
                </span>
              </div>
              {mismatch.appOlder && (
                <button type="button" className="btn btn-primary btn-sm" onClick={act}>
                  <Icon name="download" />
                  {translate('Get the new version')}
                </button>
              )}
            </div>
          </div>
          <button type="button" className="vnote-x" onClick={() => hide(mismatch.key)} aria-label={translate('Hide this notice')} title={translate('Hide until the app is reopened')}>
            <Icon name="x" />
          </button>
        </div>
      )}
      {update && (
        <div className="vnote info" role="status">
          <span className="vnote-ic">
            <Icon name="sparkles" />
          </span>
          <div className="vnote-body">
            <b className="vnote-t">{translate(`MedAssist ${update.latest} is available`)}</b>
            <p className="vnote-d">
              {translate('You are on version')} <b className="num">{update.app}</b>. {translate('Update when it is convenient — your data stays on the clinic server.')}
            </p>
            {update.notes && (
              <details className="vnote-notes">
                <summary>{translate('What’s in this version')}</summary>
                <p>{update.notes}</p>
              </details>
            )}
            <div className="vnote-foot">
              <span />
              <button type="button" className="btn btn-outline btn-sm" onClick={act}>
                {translate('See what’s new')}
              </button>
            </div>
          </div>
          <button type="button" className="vnote-x" onClick={() => hide(update.key)} aria-label={translate('Hide this notice')} title={translate('Hide until the app is reopened')}>
            <Icon name="x" />
          </button>
        </div>
      )}
      {updated && (
        <div className="vnote info" role="status">
          <span className="vnote-ic">
            <Icon name="circle-check" />
          </span>
          <div className="vnote-body">
            <b className="vnote-t">
              {translate('MedAssist was updated to')} <span className="num">{updated.to}</span>
            </b>
            <p className="vnote-d">
              {translate('Previous version')} <b className="num">{updated.from}</b>. {translate('If something stopped working after the update, save the error details (Settings › Account) and tell the team — older versions stay available to reinstall.')}
            </p>
            <div className="vnote-foot">
              <span />
              <button type="button" className="btn btn-outline btn-sm" onClick={openAllReleases}>
                {translate('All versions')}
              </button>
            </div>
          </div>
          <button type="button" className="vnote-x" onClick={() => hide(updated.key)} aria-label={translate('Hide this notice')} title={translate('Hide until the app is reopened')}>
            <Icon name="x" />
          </button>
        </div>
      )}
    </>
  )
}

// Màn đăng nhập: chuông ở góc phải trên. Có bản mới / lệch phiên bản chưa xem → chuông rung nhẹ + chấm đỏ;
// bấm → popup ngay dưới chuông với các thẻ cập nhật (không có gì thì báo đang dùng bản mới nhất). Xem rồi thì thôi rung trong phiên.
const SEEN_KEY = 'medassist_version_notice_seen'
const readSeen = () => {
  try {
    return sessionStorage.getItem(SEEN_KEY) || ''
  } catch {
    return ''
  }
}

export default function UpdateBell() {
  const notices = useVersionNotices()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(readSeen)
  const ref = useRef(null)
  const unseen = notices.keys.some((k) => !seen.split('|').includes(k))

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const toggle = () => {
    setOpen(!open)
    if (!unseen) return
    const next = [seen, ...notices.keys].filter(Boolean).join('|')
    try {
      sessionStorage.setItem(SEEN_KEY, next)
    } catch {
      /* chỉ nhớ tới khi tải lại */
    }
    setSeen(next)
  }

  const label = translate(unseen ? 'Updates — a new version is available' : 'Updates')
  return (
    <div className="ubell" ref={ref}>
      <button type="button" className={'ubell-btn' + (unseen && !open ? ' ring' : '')} onClick={toggle} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open}>
        <Icon name="bell" />
        {unseen && <span className="ubell-dot" />}
      </button>
      {open && (
        <div className="ubell-pop" role="dialog" aria-label={translate('Updates')}>
          <div className="ubell-h">{translate('Updates')}</div>
          {notices.keys.length ? (
            <div className="ubell-list">
              <VersionNoticeList notices={notices} onAction={() => setOpen(false)} />
            </div>
          ) : (
            <div className="ubell-empty">
              <span className="ubell-empty-ic">
                <Icon name="circle-check" />
              </span>
              <div>
                <b>{translate('You are on the latest version')}</b>
                <span>
                  MedAssist <span className="num">{clean(appVersion)}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
