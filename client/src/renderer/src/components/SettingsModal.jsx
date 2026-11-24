import { useEffect, useState } from 'react'
import Icon from './Icon'
import Modal, { ModalHeader } from './Modal'
import { LANGUAGES, getLang, setLang, translate } from '../i18n'
import { SIDEBAR_THEMES, getSidebarTheme, setSidebarTheme } from '../api/sidebarTheme'
import { getBaseUrl } from '../api/serverConfig'
import { useServerOnline } from '../api/connectivity'
import { version as appVersion } from '../../../../package.json'
import { COLOR_MODES, UI_SCALES, ACCENTS, getColorMode, setColorMode, getUiScale, setUiScale, getReduceMotion, setReduceMotion, getAccent, setAccent } from '../api/appTheme'
import { hhmm } from '../utils/format'

// Cài đặt cá nhân của máy này (nút bánh răng trên thanh trên): Giao diện, Ngôn ngữ, Tài khoản.
// Mọi lựa chọn áp dụng ngay và chỉ lưu trên máy này — không ảnh hưởng máy khác, không cần nút Lưu.

// Bản thu nhỏ của màn hình app theo chế độ màu + màu thanh menu (để chọn bằng mắt, không phải đoán tên màu).
const MODE_COLORS = {
  light: { bg: '#F0F2F5', surface: '#FFFFFF', line: '#E1E4E8', ink: '#C5CCD3' },
  dark: { bg: '#0B1118', surface: '#18222D', line: '#243140', ink: '#3A4A5C' }
}
function MiniApp({ mode, sidebar, accent = '#1877F2' }) {
  const m = MODE_COLORS[mode === 'system' ? 'light' : mode]
  const side = sidebar ?? (mode === 'dark' ? { bg: '#0F161E', ink: '#5D6E80', active: 'rgba(59,139,246,.35)' } : SIDEBAR_THEMES[0])
  return (
    <span className={'mini' + (mode === 'system' ? ' split' : '')} style={{ background: m.bg }} aria-hidden="true">
      <span className="mini-side" style={{ background: side.bg, color: side.ink, borderColor: m.line }}>
        <i className="lg" style={{ background: accent }} />
        <i className="act" style={{ background: side.active }} />
        <i />
        <i />
        <i />
      </span>
      <span className="mini-main">
        <span className="mini-top" style={{ background: m.surface, borderColor: m.line }} />
        <span className="mini-row">
          {[0, 1, 2].map((k) => (
            <span key={k} className="mini-card" style={{ background: m.surface, borderColor: m.line }}>
              <i style={{ background: m.ink }} />
            </span>
          ))}
        </span>
        <span className="mini-card wide" style={{ background: m.surface, borderColor: m.line }}>
          <i style={{ background: m.ink }} />
          <i style={{ background: m.ink, width: '60%' }} />
        </span>
      </span>
      {mode === 'system' && (
        <span className="mini-dark" style={{ background: MODE_COLORS.dark.bg }}>
          <span className="mini-main">
            <span className="mini-top" style={{ background: MODE_COLORS.dark.surface, borderColor: MODE_COLORS.dark.line }} />
            <span className="mini-card wide" style={{ background: MODE_COLORS.dark.surface, borderColor: MODE_COLORS.dark.line }}>
              <i style={{ background: MODE_COLORS.dark.ink }} />
            </span>
          </span>
        </span>
      )}
    </span>
  )
}

const LANG_SAMPLE = { vi: 'Hôm nay 12 bệnh nhân chờ khám', en: '12 patients waiting today' }
const ROLE_ICON = { doctor: 'stethoscope', reception: 'clipboard-list', admin: 'shield' }

// Đồng hồ giờ Việt Nam (cập nhật mỗi 15 giây).
function ClockCard() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(t)
  }, [])
  const tz = 'Asia/Ho_Chi_Minh'
  const time = hhmm(now, tz)
  const day = now.toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz })
  return (
    <div className="clock-card">
      <div className="clock-main">
        <span className="clock-ic">
          <Icon name="clock" />
        </span>
        <div>
          <b className="clock-t num">{time}</b>
          <span className="clock-d">{day}</span>
        </div>
        <span className="clock-tz">
          <Icon name="globe" />
          {translate('Vietnam time (GMT+7)')}
        </span>
      </div>
    </div>
  )
}

// Trạng thái kết nối máy chủ (chỉ chạy khi mở tab Tài khoản).
function ConnState() {
  const online = useServerOnline()
  return (
    <>
      <span className={'acct-dot' + (online ? ' ok' : '')} />
      {translate(online ? 'Connected' : 'Offline')}
    </>
  )
}

const TABS = [
  { key: 'look', label: 'Appearance', icon: 'palette' },
  { key: 'lang', label: 'Language & time', icon: 'languages' },
  { key: 'acct', label: 'Account', icon: 'user-round' }
]

export default function SettingsModal({ open, onClose, user, onChangePassword }) {
  const [tab, setTab] = useState('look')
  const [mode, setMode] = useState(getColorMode)
  const [sidebar, setSidebar] = useState(getSidebarTheme)
  const [scale, setScale] = useState(getUiScale)
  const [calm, setCalm] = useState(getReduceMotion)
  const [accent, setAccentState] = useState(getAccent)
  // Bản xem trước thanh menu theo màu phòng khám đang chọn.
  const accentDef = ACCENTS.find((a) => a.key === accent)
  const accentColor = accentDef?.color
  const tint = (t) => (accentDef?.side ? { ...t, ...(t.key === 'dark' ? { bg: accentDef.side, active: accentDef.color } : { active: accentDef.soft }) } : t)

  const pickMode = (v) => (setMode(v), setColorMode(v))
  const pickSidebar = (v) => (setSidebar(v), setSidebarTheme(v))
  const pickScale = (v) => (setScale(v), setUiScale(v))
  const pickCalm = (v) => (setCalm(v), setReduceMotion(v))
  const pickAccent = (v) => (setAccentState(v), setAccent(v))
  // Đổi ngôn ngữ: giao diện đổi ngay là đủ, không hiện thêm thông báo.
  function chooseLanguage(code) {
    if (code !== getLang()) setLang(code)
  }

  return (
    <Modal open={open} onClose={onClose} wide>
      <ModalHeader title="Settings" onClose={onClose} />
      <div className="modal-b flush">
        <div className="pset">
          <nav className="pset-nav" role="tablist" aria-label={translate('Settings')}>
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={'vtab' + (tab === t.key ? ' on' : '')} onClick={() => setTab(t.key)}>
                <Icon name={t.icon} />
                {translate(t.label)}
              </button>
            ))}
            <p className="pset-note">
              <Icon name="monitor" />
              <span>{translate('Saved on this computer only and applied right away.')}</span>
            </p>
          </nav>

          <div className="pset-body">
            {tab === 'look' && (
              <>
                <section className="pset-sec">
                  <h4>{translate('Color mode')}</h4>
                  <p className="hint">{translate('Dark mode is easier on the eyes in dim rooms and at night.')}</p>
                  <div className="pick-grid" role="radiogroup" aria-label={translate('Color mode')}>
                    {COLOR_MODES.map((m) => (
                      <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} className={'pick' + (mode === m.key ? ' on' : '')} onClick={() => pickMode(m.key)}>
                        <MiniApp mode={m.key} accent={accentColor} sidebar={m.key === 'light' ? tint(SIDEBAR_THEMES.find((t) => t.key === sidebar)) : null} />
                        <span className="pick-l">
                          <Icon name={m.icon} />
                          {translate(m.label)}
                          {mode === m.key && <Icon name="circle-check" className="pick-ok" />}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="pset-sec">
                  <h4>{translate('Clinic color')}</h4>
                  <p className="hint">{translate('Main color of buttons, links, the selected menu item and the dark menu bar. Status colors stay the same.')}</p>
                  <div className="pick-grid" role="radiogroup" aria-label={translate('Clinic color')}>
                    {ACCENTS.map((a) => (
                      <button key={a.key} type="button" role="radio" aria-checked={accent === a.key} className={'pick' + (accent === a.key ? ' on' : '')} onClick={() => pickAccent(a.key)}>
                        <MiniApp mode="light" accent={a.color} sidebar={{ ...SIDEBAR_THEMES[0], active: a.soft ?? SIDEBAR_THEMES[0].active }} />
                        <span className="pick-l">
                          <span className="sw-dot" style={{ background: a.color }} />
                          {translate(a.label)}
                          {accent === a.key && <Icon name="circle-check" className="pick-ok" />}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="pset-sec">
                  <h4>{translate('Menu bar color')}</h4>
                  <p className="hint">{translate(mode === 'dark' ? 'In dark mode the menu bar follows the dark palette.' : 'Only the left menu bar changes; pages stay light.')}</p>
                  <div className="pick-grid" role="radiogroup" aria-label={translate('Menu bar color')}>
                    {SIDEBAR_THEMES.map((t) => (
                      <button key={t.key} type="button" role="radio" aria-checked={sidebar === t.key} disabled={mode === 'dark'} className={'pick' + (sidebar === t.key ? ' on' : '')} onClick={() => pickSidebar(t.key)}>
                        <MiniApp mode="light" accent={accentColor} sidebar={tint(t)} />
                        <span className="pick-l">
                          <span className="sw-dot" style={{ background: t.bg }} />
                          {translate(t.label)}
                          {sidebar === t.key && <Icon name="circle-check" className="pick-ok" />}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="pset-sec">
                  <div className="pset-pair">
                    <div className="pset-tile">
                      <div className="pset-tile-h">
                        <Icon name="a-large-small" />
                        <h4>{translate('Text size')}</h4>
                        <span className="pset-val num">{Math.round(scale * 100)}%</span>
                      </div>
                      <div className="scale-pick" role="radiogroup" aria-label={translate('Text size')}>
                        {UI_SCALES.map((v) => (
                          <button key={v} type="button" role="radio" aria-checked={scale === v} className={scale === v ? 'on' : ''} onClick={() => pickScale(v)} title={Math.round(v * 100) + '%'}>
                            <span style={{ fontSize: 10 + (v - 0.9) * 22 }}>{'A'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="pset-tile">
                      <div className="pset-tile-h">
                        <Icon name="sparkle" />
                        <h4>{translate('Reduce motion')}</h4>
                        <label className="sw">
                          <input type="checkbox" checked={calm} onChange={(e) => pickCalm(e.target.checked)} aria-label={translate('Reduce motion')} />
                          <span />
                        </label>
                      </div>
                      <p className="pset-tile-note">{translate(calm ? 'Transition effects are off.' : 'Transition effects are on.')}</p>
                    </div>
                  </div>
                </section>
              </>
            )}

            {tab === 'lang' && (
              <>
                <section className="pset-sec">
                  <h4>{translate('Display language')}</h4>
                  <p className="hint">{translate('Applies right away to menus, buttons and messages on this computer.')}</p>
                  <div className="lang-cards" role="radiogroup" aria-label={translate('Display language')}>
                    {LANGUAGES.map((l) => {
                      const on = getLang() === l.code
                      return (
                        <button key={l.code} type="button" role="radio" aria-checked={on} className={'lang-card' + (on ? ' on' : '')} onClick={() => chooseLanguage(l.code)}>
                          <span className={'lang-badge ' + l.code}>{l.code.toUpperCase()}</span>
                          <span className="lang-txt">
                            <b>{l.name}</b>
                            <span className="lang-sample">{LANG_SAMPLE[l.code]}</span>
                          </span>
                          <span className="lang-check" aria-hidden="true">
                            <Icon name={on ? 'circle-check' : 'circle'} />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="pset-info">
                    <Icon name="file-text" />
                    {translate('Patient data and printed documents stay in Vietnamese.')}
                  </p>
                </section>
                <section className="pset-sec">
                  <h4>{translate('Date & time')}</h4>
                  <ClockCard />
                </section>
              </>
            )}

            {tab === 'acct' && (
              <>
                <section className="pset-sec">
                  <div className="acct-hero">
                    <span className="acct-ava">{user.av}</span>
                    <div className="acct-id">
                      <b>{user.name}</b>
                      <div className="acct-tags">
                        <span className="acct-tag is-role">
                          <Icon name={ROLE_ICON[user.roleKey] ?? 'user-round'} />
                          {user.role}
                        </span>
                        {user.room && (
                          <span className="acct-tag">
                            <Icon name="door-open" />
                            {user.room}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
                <section className="pset-sec acct-grid">
                  <div className="acct-box">
                    <div className="acct-box-h">
                      <span className="acct-box-ic">
                        <Icon name="shield-check" />
                      </span>
                      <b>{translate('Sign-in & security')}</b>
                    </div>
                    <dl className="acct-dl">
                      <dt>{translate('Username')}</dt>
                      <dd className="num">{user.username}</dd>
                      <dt>{translate('Role')}</dt>
                      <dd>{user.role}</dd>
                      <dt>{translate('Password')}</dt>
                      <dd className="acct-pw">••••••••</dd>
                    </dl>
                    <button className="btn btn-outline btn-sm acct-act" onClick={onChangePassword}>
                      <Icon name="key-round" />
                      {translate('Change password')}
                    </button>
                  </div>
                  <div className="acct-box">
                    <div className="acct-box-h">
                      <span className="acct-box-ic">
                        <Icon name="monitor" />
                      </span>
                      <b>{translate('This computer')}</b>
                    </div>
                    <dl className="acct-dl">
                      <dt>{translate('Server URL')}</dt>
                      <dd className="num" title={getBaseUrl()}>
                        <span className="acct-url">{getBaseUrl()}</span>
                      </dd>
                      <dt>{translate('Connection')}</dt>
                      <dd>
                        <ConnState />
                      </dd>
                      <dt>{translate('Version')}</dt>
                      <dd className="num">{appVersion}</dd>
                    </dl>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="modal-f">
        <span className="sp" />
        <button className="btn btn-outline" onClick={onClose}>
          {translate('Close')}
        </button>
      </div>
    </Modal>
  )
}
