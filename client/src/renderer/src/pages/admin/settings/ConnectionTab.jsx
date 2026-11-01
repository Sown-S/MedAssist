import { useEffect, useState } from 'react'
import Icon from '../../../components/Icon'
import Button from '../../../components/Button'
import { checkHealth } from '../../../api/client'
import ServerAddress from '../../../components/ServerAddress'
import { fmtDateTime } from '../inventory/shared'
import { version } from '../../../../../../package.json'

export function ConnectionTab({ onNavigate }) {
  const [health, setHealth] = useState(null)
  const [busy, setBusy] = useState(false)
  async function test() {
    setBusy(true)
    setHealth(await checkHealth())
    setBusy(false)
  }
  useEffect(() => {
    test()
  }, [])
  const ai = health?.services.find((s) => s.key === 'ai')

  return (
    <>
      <div className="card">
        <div className="set-backup-head">
          <div>
            <div className="card-title">Server connection</div>
          </div>
          <Button className="btn btn-primary btn-sm" loading={busy} onClick={test}>
            <Icon name="wifi" /> <span>{busy ? 'Checking…' : 'Test connection'}</span>
          </Button>
        </div>
        <div style={{ margin: '12px 0', maxWidth: 520 }}>
          <ServerAddress onSaved={test} />
        </div>
        {health && (
          <>
            {health.services.map((s) => (
              <div className="status-row" key={s.key}>
                <span className="alert-txt">
                  <b>{s.name}</b>
                  <span>{s.detail}</span>
                </span>
                <span className={'badge ' + (s.ok ? 'ok' : s.ok === null ? 'muted' : 'low')}>{s.state}</span>
              </div>
            ))}
            <div className="ai-small ai-soft" style={{ marginTop: 8 }}>
              <span>Checked at</span> <span className="mono">{fmtDateTime(health.checkedAt)}</span>
            </div>
          </>
        )}
        <p className="ai-foot-note">
          <Icon name="settings" />{' '}
          <span>The server address is saved on this computer only — each clinic PC sets its own. Home › System status uses this same check.</span>
        </p>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">AI module</div>
        <div className="set-backup-head">
          <div className="ai-small ai-soft">
            {ai ? (
              <>
                <span className={'badge ' + (ai.ok ? 'ok' : ai.ok === null ? 'muted' : 'low')}>{ai.state}</span> <span>{ai.detail}</span>
              </>
            ) : (
              <span>—</span>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('ai')}>
            <Icon name="bulb" /> <span>Open AI configuration</span>
          </button>
        </div>
        <p className="ai-soft ai-small">Rules and thresholds are managed on the AI configuration page.</p>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">About this installation</div>
        {[
          ['App version', version],
          ['Server version', health?.serverVersion ?? '—'],
          ['Time', 'Stored in UTC on the server, shown in Vietnam time (GMT+7)']
        ].map(([k, v]) => (
          <div className="pref-row inline" key={k}>
            <span>{k}</span>
            <b className={k === 'Time' ? '' : 'mono'}>{v}</b>
          </div>
        ))}
      </div>
    </>
  )
}
