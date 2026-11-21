import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import ChangePasswordModal from './ChangePasswordModal'
import HelpModal from './HelpModal'
import SettingsModal from './SettingsModal'
import Clip from './Clip'
import useNotifications from './useNotifications'
import { OPEN_EVENT } from './useGlobalKeys'
import { LANGUAGES, getLang, setLang, translate } from '../i18n'
import { useNavigate } from 'react-router-dom'

// Cụm nút góc phải thanh trên: chuông thông báo, ngôn ngữ, trợ giúp, cài đặt, tài khoản.
export default function TopActions({ user, onSignOut }) {
  const [open, setOpen] = useState(null)
  const [unread, setUnread] = useState(true)
  const bellRef = useRef(null)
  const langRef = useRef(null)
  const acctRef = useRef(null)
  const { live, all: notifications } = useNotifications(user)
  const navigate = useNavigate()
  // Đổi ngôn ngữ: giao diện đổi ngay, không hiện thông báo.
  function chooseLanguage(code) {
    if (code !== getLang()) setLang(code)
  }

  // Phím tắt chung (F1 / ? → Trợ giúp, Ctrl+, → Cài đặt).
  useEffect(() => {
    const on = (e) => setOpen(e.detail)
    window.addEventListener(OPEN_EVENT, on)
    return () => window.removeEventListener(OPEN_EVENT, on)
  }, [])

  // Các menu thả xuống (chuông, ngôn ngữ, tài khoản) đóng khi bấm ra ngoài.
  useEffect(() => {
    const ref = { bell: bellRef, lang: langRef, acct: acctRef }[open]
    if (!ref) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const ib = (icon, tip, onClick) => (
    <button className="btn btn-ghost btn-icon" title={translate(tip)} aria-label={translate(tip)} onClick={onClick}>
      <Icon name={icon} />
    </button>
  )

  return (
    <>
      <div className="tb bell" ref={bellRef}>
        <button
          className="btn btn-ghost btn-icon"
          title={translate('Notifications')}
          aria-label={translate('Notifications')}
          aria-haspopup="dialog"
          aria-expanded={open === 'bell'}
          onClick={() => {
            setOpen(open === 'bell' ? null : 'bell')
            setUnread(false)
          }}
        >
          <Icon name="bell" />
        </button>
        {(unread || live.length > 0) && notifications.length > 0 && <span className="badge-dot" />}
        {open === 'bell' && (
          <div className="menu open bell-menu">
            <div className="bell-scroll">
              <div className="mh">Notifications</div>
              {notifications.map((n) => (
                <div
                  className={'ni' + (n.to ? ' pointer' : '')}
                  key={n.id}
                  onClick={() => {
                    if (!n.to) return
                    setOpen(null)
                    navigate(n.to)
                  }}
                >
                  <div className={'ico w-30 h-30 ' + (n.urgent ? 'd' : n.icon ? 'n' : 'w')}>
                    <Icon name={n.icon ?? 'package-x'} />
                  </div>
                  <div className="minw-0 grow">
                    <Clip as="b" title={n.title}>
                      {n.title}
                    </Clip>
                    <Clip lines={2} className="muted" title={n.title} full={n.note + (n.time ? ' · ' + n.time : '')}>
                      {n.note}
                      {n.time ? ' · ' + n.time : ''}
                    </Clip>
                  </div>
                </div>
              ))}
              {!notifications.length && <div className="ni muted">No notifications.</div>}
            </div>
          </div>
        )}
      </div>
      <div className="tb" ref={langRef}>
        {ib('languages', 'Language', () => setOpen(open === 'lang' ? null : 'lang'))}
        {open === 'lang' && (
          <div className="menu open">
            <div className="mh">Language</div>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                className={getLang() === l.code ? 'on' : ''}
                onClick={() => {
                  setOpen(null)
                  chooseLanguage(l.code)
                }}
              >
                <Icon name={getLang() === l.code ? 'check' : 'globe'} />
                <span>{l.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="tb">{ib('circle-help', 'Help', () => setOpen('help'))}</div>
      <div className="tb">{ib('settings', 'Settings', () => setOpen('settings'))}</div>
      <div className="tb" ref={acctRef}>
        <button className="acct" onClick={() => setOpen(open === 'acct' ? null : 'acct')} aria-haspopup="menu" aria-expanded={open === 'acct'}>
          <div className="ava">{user.av}</div>
          <div className="who">
            <b>{user.name}</b>
            <span>{user.role}</span>
          </div>
          <Icon name="chevron-down" />
        </button>
        {open === 'acct' && (
          <div className="menu open" role="menu">
            <div className="mh">Account</div>
            <button role="menuitem" onClick={() => setOpen('password')}>
              <Icon name="key-round" />
              <span>Change password</span>
            </button>
            <hr />
            <button
              role="menuitem"
              className="logout-btn text-danger"
              onClick={() => {
                setOpen(null)
                onSignOut?.()
              }}
            >
              <Icon name="log-out" />
              Sign out
            </button>
          </div>
        )}
      </div>

      <HelpModal open={open === 'help'} onClose={() => setOpen(null)} user={user} />

      <SettingsModal open={open === 'settings'} onClose={() => setOpen(null)} user={user} onChangePassword={() => setOpen('password')} />

      <ChangePasswordModal open={open === 'password'} onClose={() => setOpen(null)} />
    </>
  )
}
