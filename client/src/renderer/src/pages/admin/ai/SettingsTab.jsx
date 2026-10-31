import { useEffect, useState } from 'react'
import Icon from '../../../components/Icon'
import { useToast } from '../../../context/ToastContext'
import { updateSettings } from '../../../api/aiConfigStore'
import { checkHealth } from '../../../api/client'
import { Switch, ConfirmDialog } from './ui'

// Client không gọi thẳng Ollama: LLM không có xác thực nên chỉ nằm trong mạng Docker nội bộ.
// Mô hình, timeout, chế độ dự phòng… là cấu hình của server — ở đây chỉ hiển thị (trạng thái lấy từ GET /health).
const SERVER_LIMITS = [
  ['Language model', 'Gemma-SEA-LION-9B (Ollama, on the admin workstation)'],
  ['Free-text extraction', 'p95 ≈ 20 s · timeout 30 s'],
  ['AI assessment', 'p95 ≈ 60 s · timeout 90 s · at most 2 cases at a time'],
  ['Candidates shown', 'At most 3, chosen only from the approved knowledge base'],
  ['When the model fails', 'Rule-only result with a banner (always on)']
]

export default function SettingsTab({ settings, user }) {
  const { showToast } = useToast()
  const [enabled, setEnabled] = useState(settings.enabled)
  const [health, setHealth] = useState(null)
  const [checking, setChecking] = useState(false)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => setEnabled(settings.enabled), [settings.enabled])

  async function check() {
    setChecking(true)
    setHealth(await checkHealth())
    setChecking(false)
  }
  useEffect(() => {
    check()
  }, [])

  const ai = health?.services.find((s) => s.key === 'ai')
  const api = health?.services.find((s) => s.key === 'api')
  let mode
  if (!settings.enabled) mode = { tone: 'muted', title: 'AI module is off', text: 'Only the red-flag and priority-floor rules keep running; doctors see a Rule-only ranking.' }
  else if (ai?.ok) mode = { tone: 'ok', title: 'Hybrid mode: language model + hard rules', text: 'Candidates come from the approved knowledge base; the model ranks and explains them.' }
  else mode = { tone: 'warn', title: 'Rule-only mode', text: 'The AI service is not available; the system keeps working with the deterministic rules.' }

  return (
    <div className="ai-settings">
      <div className={'ai-mode ' + mode.tone}>
        <Icon name={mode.tone === 'ok' ? 'check' : mode.tone === 'muted' ? 'ban' : 'alert'} />
        <div>
          <b>{mode.title}</b>
          <div>{mode.text}</div>
        </div>
      </div>

      <div className="ai-settings-grid">
        <div className="card">
          <div className="card-title">
            <Icon name="zap" /> <span>Module</span>
          </div>
          <div className="pref-row inline">
            <div>
              <b>Enable AI module</b>
              <span>Diagnosis suggestions in the consultation screen. Red-flag and priority-floor rules always run, even when the module is off.</span>
            </div>
            <Switch checked={enabled} onChange={setEnabled} />
          </div>
          <div className="pref-row inline ai-locked">
            <div>
              <b>
                <span>“Unconfirmed” label on every suggestion</span> <Icon name="lock" />
              </b>
              <span>Always on (human-in-the-loop): a suggestion is only written to the medical record after the doctor confirms it.</span>
            </div>
            <Switch checked disabled title="Cannot be turned off" onChange={() => {}} />
          </div>
          <div className="consult-footer">
            <button className="btn btn-primary" disabled={enabled === settings.enabled} onClick={() => setConfirm(true)}>
              <Icon name="save" /> <span>Save</span>
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <Icon name="monitor" /> <span>AI service (on the clinic server)</span>
            <span className={'badge ' + (checking ? '' : ai?.ok ? 'ok' : 'low')} style={{ marginLeft: 'auto' }}>
              {checking ? 'Checking…' : ai?.ok ? 'Running' : 'Not available'}
            </span>
          </div>
          <p className="ai-soft ai-small">
            <span>Checked through the MedAssist server</span> (<span className="mono">GET /health</span>) — <span>the language model is never reached directly from client PCs.</span>
          </p>
          {health && !checking && (
            <table className="dt">
              <tbody>
                {[api, ai].filter(Boolean).map((s) => (
                  <tr key={s.key}>
                    <td>{s.name}</td>
                    <td>
                      <span className={'badge ' + (s.ok ? 'ok' : 'low')}>{s.state}</span>
                    </td>
                    <td className="mono ai-small">{s.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {health?.sample && <p className="ai-hint">Demo mode — sample status, no server connected.</p>}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} disabled={checking} onClick={check}>
            <Icon name="wifi" /> <span>Check again</span>
          </button>
        </div>

        <div className="card">
          <div className="card-title">
            <Icon name="lock" /> <span>Server limits (read only)</span>
          </div>
          <table className="dt">
            <tbody>
              {SERVER_LIMITS.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ai-hint">These are set in the server configuration (Docker Compose on the admin workstation), not in the client.</p>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Save AI module settings"
        message={settings.enabled && !enabled ? 'Turning the AI module off affects every doctor immediately.' : 'The new settings apply to every doctor immediately.'}
        confirmLabel="Save"
        danger={settings.enabled && !enabled}
        requireNote
        onConfirm={(note) => {
          updateSettings({ ...settings, enabled }, user, note)
          setConfirm(false)
          showToast('AI settings saved')
        }}
        onCancel={() => setConfirm(false)}
      />
    </div>
  )
}
