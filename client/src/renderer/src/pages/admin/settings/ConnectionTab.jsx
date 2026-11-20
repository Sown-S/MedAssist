import { useEffect, useState } from 'react'
import Icon from '../../../components/Icon'
import Button from '../../../components/Button'
import { checkHealth } from '../../../api/client'
import ServerAddress from '../../../components/ServerAddress'
import { version } from '../../../../../../package.json'
import { fmtDateTime } from '../../../utils/format'

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
                <span className={'badge ' + (s.ok ? 'b-success' : s.ok === null ? 'b-neutral' : 'b-danger')}>{s.state}</span>
              </div>
            ))}
            <div className="small muted mt-8">
              <span>Checked at</span> <span className="num">{fmtDateTime(health.checkedAt)}</span>
            </div>
          </>
        )}
        <p className="muted small foot-note">
          <Icon name="settings" /> <span>The server address is saved on this computer only — each clinic PC sets its own. Home › System status uses this same check.</span>
        </p>
      </div>

      <div className="card mt-14">
        <div className="card-h">
          <h3>AI module</h3>
        </div>
        <div className="card-b">
          <div className="set-backup-head">
            <div className="small muted">
              {ai ? (
                <>
                  <span className={'badge ' + (ai.ok ? 'b-success' : ai.ok === null ? 'b-neutral' : 'b-danger')}>{ai.state}</span> <span>{ai.detail}</span>
                </>
              ) : (
                <span>—</span>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('ai')}>
              <Icon name="bulb" /> <span>Open AI configuration</span>
            </button>
          </div>
          <p className="muted small">Rules and thresholds are managed on the AI configuration page.</p>
        </div>
      </div>

      <div className="card mt-14">
        <div className="card-h">
          <h3>About this installation</h3>
        </div>
        <div className="card-b">
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
      </div>
    </>
  )
}
