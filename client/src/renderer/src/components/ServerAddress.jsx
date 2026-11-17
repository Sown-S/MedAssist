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

  // Màn đăng nhập (và màn khởi động): thẻ địa chỉ máy chủ — ô nhập rộng hết thẻ, hai nút bằng nhau bên dưới,
  // dòng trạng thái đổi màu theo kết quả (xám = chưa kiểm tra, xanh = kết nối được + độ trễ, đỏ = lỗi).
  if (variant === 'login') {
    const st = status.state === 'fail' ? 'bad' : status.state === 'ok' ? 'good' : status.state === 'checking' ? 'wait' : 'idle'
    const changed = normalizeUrl(value) !== current
    return (
      <div className="srv-card">
        <div className="srv-card-h">
          <span className="srv-ic">
            <Icon name="server" />
          </span>
          <div>
            <b>{translate('Clinic server address')}</b>
            <span>{translate('Saved on this computer only — ask the administrator for the address.')}</span>
          </div>
        </div>
        <div className={'srv-input' + (st === 'bad' ? ' bad' : st === 'good' ? ' good' : '')}>
          <Icon name="globe" />
          <input id="srv" value={value} spellCheck={false} placeholder="https://192.168.1.10" aria-label={translate('Clinic server address')} onChange={(e) => (setValue(e.target.value), setStatus({ state: 'idle' }))} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), test())} />
          {value && (
            <button type="button" className="srv-clear" title={translate('Clear')} onClick={() => (setValue(''), setStatus({ state: 'idle' }))}>
              <Icon name="x" />
            </button>
          )}
        </div>
        <div className="srv-acts">
          <Button className="btn btn-outline" loading={status.state === 'checking'} onClick={test}>
            <Icon name="plug-zap" />
            {translate('Test connection')}
          </Button>
          <button type="button" className="btn btn-primary" disabled={!changed} onClick={save} title={changed ? undefined : translate('The address has not changed')}>
            <Icon name="save" />
            {translate('Save address')}
          </button>
        </div>
        <div className={'srv-state ' + st} role="status">
          <Icon name={st === 'bad' ? 'circle-alert' : st === 'good' ? 'circle-check' : st === 'wait' ? 'loader' : 'info'} />
          <span>{status.text ?? translate('Example: https://192.168.1.10 or http://127.0.0.1:8000 when the server runs on this computer.')}</span>
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
