import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { LANGUAGES, getLang, setLang, translate } from '../i18n'
import { COLOR_MODES, ACCENTS, getColorMode, setColorMode, getAccent, setAccent } from '../api/appTheme'
import { getBaseUrl } from '../api/serverConfig'
import { useServerOnline } from '../api/connectivity'

// Nút cài đặt ở góc phải trên màn đăng nhập (cạnh chuông cập nhật): ngôn ngữ, giao diện sáng/tối, màu phòng khám, máy chủ.
// Lựa chọn áp dụng ngay và lưu trên máy này — cùng chỗ lưu với Cài đặt trong app.
// onServer: mở / đóng khung đổi địa chỉ máy chủ ngay dưới form đăng nhập.
export default function LoginSettings({ onServer }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState(getColorMode)
  const [accent, setAccentState] = useState(getAccent)
  const online = useServerOnline()
  const ref = useRef(null)

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

  const pickMode = (v) => (setMode(v), setColorMode(v))
  const pickAccent = (v) => (setAccentState(v), setAccent(v))
  const label = translate('Settings')
  return (
    <div className="lset" ref={ref}>
      <button type="button" className="ubell-btn" onClick={() => setOpen(!open)} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open}>
        <Icon name="settings" />
      </button>
      {open && (
        <div className="lset-pop" role="dialog" aria-label={label}>
          <div className="lset-h">{label}</div>
          <div className="lset-sec">
            <div className="lset-l">{translate('Language')}</div>
            <div className="lset-seg" role="radiogroup" aria-label={translate('Language')}>
              {[...LANGUAGES]
                .sort((a) => (a.code === 'vi' ? -1 : 1))
                .map((l) => (
                  <button key={l.code} type="button" role="radio" aria-checked={getLang() === l.code} className={getLang() === l.code ? 'on' : ''} onClick={() => getLang() !== l.code && setLang(l.code)}>
                    {l.name}
                  </button>
                ))}
            </div>
          </div>
          <div className="lset-sec">
            <div className="lset-l">{translate('Appearance')}</div>
            <div className="lset-seg three" role="radiogroup" aria-label={translate('Appearance')}>
              {COLOR_MODES.map((m) => (
                <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} className={mode === m.key ? 'on' : ''} onClick={() => pickMode(m.key)}>
                  <Icon name={m.icon} />
                  {translate(m.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="lset-sec">
            <div className="lset-l">{translate('Clinic color')}</div>
            <div className="lset-seg lset-sw" role="radiogroup" aria-label={translate('Clinic color')}>
              {ACCENTS.map((a) => (
                <button key={a.key} type="button" role="radio" aria-checked={accent === a.key} className={accent === a.key ? 'on' : ''} onClick={() => pickAccent(a.key)}>
                  <span className="sw-dot" style={{ background: a.grad ?? a.color }} />
                  {translate(a.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="lset-sec">
            <div className="lset-l">{translate('Clinic server address')}</div>
            <div className="lset-srv">
              <span className={'lset-dot' + (online ? ' ok' : '')} />
              <span className="lset-srv-t">
                <b className="num" title={getBaseUrl()}>
                  {getBaseUrl()}
                </b>
                <small className={online ? 'ok' : ''}>{translate(online ? 'Connected' : 'Offline')}</small>
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setOpen(false)
                  onServer?.()
                }}
              >
                {translate('Change address')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
