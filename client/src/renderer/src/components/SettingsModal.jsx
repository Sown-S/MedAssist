import { useState } from 'react'
import Icon from './Icon'
import Modal, { ModalHeader } from './Modal'
import { useToast } from '../context/ToastContext'
import { LANGUAGES, getLang, setLang, translate } from '../i18n'
import { SIDEBAR_THEMES, getSidebarTheme, setSidebarTheme } from '../api/sidebarTheme'
import { COLOR_MODES, FONT_SIZES, getColorMode, setColorMode, getFontSize, setFontSize, getReduceMotion, setReduceMotion } from '../api/appTheme'

// Cài đặt cá nhân của máy này (nút bánh răng trên thanh trên): Giao diện, Ngôn ngữ, Tài khoản.
// Mọi lựa chọn áp dụng ngay và chỉ lưu trên máy này — không ảnh hưởng máy khác, không cần nút Lưu.

// Bản thu nhỏ của màn hình app theo chế độ màu + màu thanh menu (để chọn bằng mắt, không phải đoán tên màu).
const MODE_COLORS = {
  light: { bg: '#F0F2F5', surface: '#FFFFFF', line: '#E1E4E8', ink: '#C5CCD3' },
  dark: { bg: '#0B1118', surface: '#18222D', line: '#243140', ink: '#3A4A5C' }
}
function MiniApp({ mode, sidebar }) {
  const m = MODE_COLORS[mode === 'system' ? 'light' : mode]
  const side = sidebar ?? (mode === 'dark' ? { bg: '#0F161E', ink: '#5D6E80', active: 'rgba(59,139,246,.35)' } : SIDEBAR_THEMES[0])
  return (
    <span className={'mini' + (mode === 'system' ? ' split' : '')} style={{ background: m.bg }} aria-hidden="true">
      <span className="mini-side" style={{ background: side.bg, color: side.ink, borderColor: m.line }}>
        <i className="lg" style={{ background: '#1877F2' }} />
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

const TABS = [
  { key: 'look', label: 'Appearance', icon: 'palette' },
  { key: 'lang', label: 'Language & time', icon: 'languages' },
  { key: 'acct', label: 'Account', icon: 'user-round' }
]

export default function SettingsModal({ open, onClose, user, onChangePassword }) {
  const { showToast } = useToast()
  const [tab, setTab] = useState('look')
  const [mode, setMode] = useState(getColorMode)
  const [sidebar, setSidebar] = useState(getSidebarTheme)
  const [font, setFont] = useState(getFontSize)
  const [calm, setCalm] = useState(getReduceMotion)

  const pickMode = (v) => (setMode(v), setColorMode(v))
  const pickSidebar = (v) => (setSidebar(v), setSidebarTheme(v))
  const pickFont = (v) => (setFont(v), setFontSize(v))
  const pickCalm = (v) => (setCalm(v), setReduceMotion(v))
  function chooseLanguage(code) {
    if (code === getLang()) return
    setLang(code)
    showToast('Language updated')
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
                        <MiniApp mode={m.key} sidebar={m.key === 'light' ? SIDEBAR_THEMES.find((t) => t.key === sidebar) : null} />
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
                  <h4>{translate('Menu bar color')}</h4>
                  <p className="hint">{translate(mode === 'dark' ? 'In dark mode the menu bar follows the dark palette.' : 'Only the left menu bar changes; pages stay light.')}</p>
                  <div className="swatches" role="radiogroup" aria-label={translate('Menu bar color')}>
                    {SIDEBAR_THEMES.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        role="radio"
                        aria-checked={sidebar === t.key}
                        disabled={mode === 'dark'}
                        className={'swatch' + (sidebar === t.key ? ' on' : '')}
                        onClick={() => pickSidebar(t.key)}
                        title={translate(t.label)}
                      >
                        <span className="sw-chip" style={{ background: t.bg, color: t.ink }}>
                          <i style={{ background: t.active }} />
                          <i />
                          <i />
                        </span>
                        <span>{translate(t.label)}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="pset-sec">
                  <h4>{translate('Text size')}</h4>
                  <p className="hint">{translate('Larger text helps on high-resolution screens or when reading from a distance.')}</p>
                  <div className="seg" role="radiogroup" aria-label={translate('Text size')}>
                    {FONT_SIZES.map((f) => (
                      <button key={f.key} type="button" role="radio" aria-checked={font === f.key} className={(font === f.key ? 'on' : '') + ' fs-' + f.key} onClick={() => pickFont(f.key)}>
                        <span className="aa">{'Aa'}</span> {translate(f.label)}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="pset-sec row">
                  <div>
                    <h4>{translate('Reduce motion')}</h4>
                    <p className="hint">{translate('Turns off transition effects. Windows’ “Animation effects: off” setting is always respected.')}</p>
                  </div>
                  <label className="sw">
                    <input type="checkbox" checked={calm} onChange={(e) => pickCalm(e.target.checked)} aria-label={translate('Reduce motion')} />
                    <span />
                  </label>
                </section>
              </>
            )}

            {tab === 'lang' && (
              <>
                <section className="pset-sec">
                  <h4>{translate('Display language')}</h4>
                  <p className="hint">{translate('Patient data and printed documents stay in Vietnamese.')}</p>
                  <div className="lang-pick" role="radiogroup" aria-label={translate('Display language')}>
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        role="radio"
                        aria-checked={getLang() === l.code}
                        className={'pick lang' + (getLang() === l.code ? ' on' : '')}
                        onClick={() => chooseLanguage(l.code)}
                      >
                        <span className="flag">{l.code.toUpperCase()}</span>
                        <span className="pick-l">
                          {l.name}
                          {getLang() === l.code && <Icon name="circle-check" className="pick-ok" />}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="pset-sec">
                  <h4>{translate('Time zone')}</h4>
                  <div className="pref-row inline">
                    <span>{translate('Times are shown in')}</span>
                    <b>{translate('Vietnam time (GMT+7)')}</b>
                  </div>
                </section>
              </>
            )}

            {tab === 'acct' && (
              <section className="pset-sec">
                <div className="acct-card">
                  <span className="ava lg">{user.av}</span>
                  <div>
                    <b>{user.name}</b>
                    <span className="muted small">
                      {user.role} · <span className="num">{user.username}</span>
                    </span>
                  </div>
                </div>
                {[['Name', user.name], ['Username', user.username], ['Role', user.role], ...(user.room ? [['Consultation room', user.room]] : [])].map(([k, v]) => (
                  <div className="pref-row inline" key={k}>
                    <span>{translate(k)}</span>
                    <b>{v}</b>
                  </div>
                ))}
                <button className="btn btn-outline" style={{ marginTop: 14 }} onClick={onChangePassword}>
                  <Icon name="key-round" />
                  {translate('Change password')}
                </button>
              </section>
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
