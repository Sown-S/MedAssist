import { useState, useSyncExternalStore } from 'react'
import Icon from './Icon'
import Button from './Button'
import { translate } from '../i18n'
import { getBaseUrl, setBaseUrl, subscribeBaseUrl, normalizeUrl } from '../api/serverConfig'

// Địa chỉ server của máy này (màn đăng nhập và Cài đặt › Kết nối). Vẫn lưu được khi chưa kết nối (VD server đang khởi động).
export default function ServerAddress({ onSaved, onClose, variant }) {
  const current = useSyncExternalStore(subscribeBaseUrl, getBaseUrl)
  const [value, setValue] = useState(current)
  const [status, setStatus] = useState({ state: 'idle' })

  async function test() {
    const url = normalizeUrl(value)
    if (!url) return setStatus({ state: 'fail', text: translate('Enter a valid server address, e.g. https://192.168.1.10') })
    setStatus({ state: 'checking', text: translate('Checking…') })
    const t0 = performance.now()
    try {
      const res = await fetch(url + '/health', { signal: AbortSignal.timeout(5000) })
      const ms = Math.round(performance.now() - t0)
      setStatus(res.ok ? { state: 'ok', text: translate('Connected') + ' · ' + ms + ' ms' } : { state: 'fail', text: translate('Cannot connect') + ' · HTTP ' + res.status })
    } catch (e) {
      setStatus({ state: 'fail', text: translate(e.name === 'TimeoutError' ? 'No answer within 5 seconds' : 'Cannot reach this address from this computer.') })
    }
  }
  async function save() {
    const r = await setBaseUrl(value)
    if (!r.ok) return setStatus({ state: 'fail', text: translate(r.error) })
    setValue(r.url)
    setStatus({ state: 'ok', text: translate('Server address saved for this computer.') })
    onSaved?.(r.url)
  }

  // Màn đăng nhập: đúng ô "Địa chỉ máy chủ" của bản mẫu (ô nhập + nút Kiểm tra, dòng trạng thái có chấm màu).
  if (variant === 'login') {
    const st = status.state === 'fail' ? 'bad' : status.state === 'checking' ? 'wait' : ''
    return (
      <div className="srv-box">
        <div className="field">
          <label htmlFor="srv">Clinic server address</label>
          <div className="srv">
            <input className="input" id="srv" value={value} spellCheck={false} placeholder="https://192.168.1.10" onChange={(e) => (setValue(e.target.value), setStatus({ state: 'idle' }))} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), test())} />
            <Button className="btn btn-outline" loading={status.state === 'checking'} onClick={test}>
              <Icon name="plug-zap" />
              <span>{translate('Test connection')}</span>
            </Button>
            <button type="button" className="btn btn-primary" disabled={normalizeUrl(value) === current} onClick={save}>
              {translate('Save')}
            </button>
          </div>
        </div>
        <div className={'srv-st ' + st}>
          <span className={'dot ' + (st === 'bad' ? 'bad' : st === 'wait' ? 'warn' : 'live')} />
          {status.text ?? translate('Address of the clinic server — saved on this computer only.')}
        </div>
      </div>
    )
  }

  return (
    <div className="srv-box">
      <div className="srv-top">
        <span className="srv-label">
          <Icon name="wifi" /> Server
        </span>
        {onClose && (
          <button type="button" className="srv-close" onClick={onClose} title={translate('Close')}>
            <Icon name="x" />
          </button>
        )}
      </div>
      <div className="srv-row">
        <span className={'srv-field' + (status.state === 'fail' ? ' bad' : status.state === 'ok' ? ' good' : '')}>
          <Icon name="monitor" />
          <input className="input"
            type="text"
            value={value}
            spellCheck={false}
            placeholder="https://192.168.1.10"
            onChange={(e) => (setValue(e.target.value), setStatus({ state: 'idle' }))}
            onKeyDown={(e) => e.key === 'Enter' && test()}
          />
        </span>
        <Button className="btn btn-ghost btn-sm" loading={status.state === 'checking'} onClick={test} title={translate('Test connection')}>
          {translate('Check')}
        </Button>
        <button type="button" className="btn btn-primary btn-sm" disabled={normalizeUrl(value) === current} onClick={save}>
          {translate('Save')}
        </button>
      </div>
      <small className={'srv-msg ' + status.state}>{status.text ?? translate('Address of the clinic server — saved on this computer only.')}</small>
    </div>
  )
}
