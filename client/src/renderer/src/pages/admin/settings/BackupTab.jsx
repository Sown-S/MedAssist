import { useRef, useState } from 'react'
import Icon from '../../../components/Icon'
import ReauthModal from '../../../components/ReauthModal'
import { translate } from '../../../i18n'
import { useBackupLog, createBackup, verifyBackupFile, restoreBackup } from '../../../api/backupStore'
import { DEMO_MODE } from '../../../api/client'
import { fmtDateTime } from '../inventory/shared'
import { Field } from './Field'

export function BackupTab({ user, fp, num, onNavigate, showToast }) {
  const log = useBackupLog()
  const [check, setCheck] = useState(null)
  const [mode, setMode] = useState('verify')
  const [confirm, setConfirm] = useState(false)
  const fileRef = useRef(null)

  async function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const res = await verifyBackupFile(f)
    setCheck(res)
    if (res.ok && mode === 'restore') setConfirm(true)
  }
  function pick(m) {
    setMode(m)
    setCheck(null)
    fileRef.current?.click()
  }

  return (
    <>
      {/* Chạy thật: máy chủ tự sao lưu hằng ngày (backup.ps1); khôi phục = dựng CSDL mới rồi hoán đổi (restore.ps1), không làm qua API → chỉ hiện hướng dẫn. */}
      {!DEMO_MODE ? (
        <div className="card">
          <div className="card-title">Backups</div>
          <div className="symptom-box" style={{ padding: '8px 11px', fontSize: 13.5 }}>
            Automatic daily backup on the clinic server; restoring is done by the system administrator.
          </div>
          <p className="ai-foot-note">
            <Icon name="alert" />{' '}
            <span>{translate('Daily database backup (pg_dump) to a second drive and another machine; restore follows the documented, tested procedure.')}</span>
          </p>
        </div>
      ) : (
      <div className="card">
        <div className="set-backup-head">
          <div>
            <div className="card-title">Backups</div>
            <div className="ai-small ai-soft">
              {log[0] ? (
                <>
                  <span>Last backup</span> <span className="mono">{fmtDateTime(log[0].at)}</span> <span>by</span> {log[0].by}
                </>
              ) : (
                <span className="sp-warn">No backup on record yet.</span>
              )}
            </div>
          </div>
          <div className="ai-toolbar-right">
            <button className="btn btn-primary btn-sm" onClick={() => createBackup(user).then(() => showToast('Backup file downloaded'))}>
              <Icon name="download" /> <span>Back up now</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => pick('verify')}>
              <Icon name="check" /> <span>Verify a backup file</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => pick('restore')}>
              <Icon name="repeat" /> <span>Restore…</span>
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} />
          </div>
        </div>

        {check && (
          <div className={'set-check ' + (check.ok ? 'ok' : 'bad')}>
            <Icon name={check.ok ? 'check' : 'ban'} />
            {check.ok ? (
              <div>
                <b>The backup file is usable</b> — <span className="mono">{check.name}</span>
                <div className="ai-small ai-soft">
                  <span>Created</span> <span className="mono">{fmtDateTime(check.file.createdAt)}</span> <span>by</span> {check.file.createdBy} · <span>checksum OK</span> ·{' '}
                  <span className="mono">{check.parts.length}</span> <span>data sections</span>
                </div>
              </div>
            ) : (
              <div>
                <b>This file cannot be restored</b>
                <div className="ai-small">{check.error}</div>
              </div>
            )}
          </div>
        )}

        {log.length > 0 && (
          <table className="dt" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Time</th>
                <th>File</th>
                <th>By</th>
                <th className="num">Size</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>
              {log.slice(0, 8).map((b) => (
                <tr key={b.at}>
                  <td className="mono">{fmtDateTime(b.at)}</td>
                  <td className="mono ai-small">{b.file}</td>
                  <td>{b.by}</td>
                  <td className="num mono">{(b.size / 1024).toFixed(0)} KB</td>
                  <td>{b.verified ? <span className="badge ok">Verified</span> : <span className="badge muted">Not yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="ai-foot-note">
          <Icon name="alert" />{' '}
          <span>
            In this demo all data lives on this computer, so “Back up now” downloads one file with everything. Restoring replaces all data except the activity log, which is
            never rolled back, and restarts the app.
          </span>
        </p>
      </div>
      )}

      {DEMO_MODE && (
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Automatic backup (on the clinic server)</div>
        <div className="set-grid">
          <Field path="backup.server" wide hint="Set up on the clinic server (deploy scripts), not from this screen.">
            <div className="symptom-box" style={{ padding: '8px 11px', fontSize: 13.5 }}>
              {translate('Daily database backup (pg_dump) to a second drive and another machine; restore follows the documented, tested procedure.')}
            </div>
          </Field>
        </div>
      </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Data retention</div>
        <div className="set-grid">
          <Field {...fp('retention.auditYears')} hint="Older entries are archived, never deleted silently.">
            <div className="set-unit">
              <input {...num('retention.auditYears')} min="1" /> <span>years</span>
            </div>
          </Field>
          <Field {...fp('retention.recordYears')}>
            <div className="set-unit">
              <input {...num('retention.recordYears')} min="1" /> <span>years</span>
            </div>
          </Field>
        </div>
        <div className="ai-toolbar-right" style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('history')}>
            <Icon name="download" /> <span>Export the activity log</span>
          </button>
        </div>
        <p className="ai-foot-note">
          <Icon name="alert" />{' '}
          <span>
            Check these periods against the medical-records rules and the personal data protection regulation the project cites (e.g. Decree 13/2023/NĐ-CP) before going live.
          </span>
        </p>
      </div>

      <ReauthModal
        open={confirm}
        title="Restore data from a backup"
        confirmLabel="Restore"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={() => restoreBackup(check, user)}
      >
        {check?.ok && (
          <p className="ai-soft">
            <span>All current data will be replaced by the backup from</span> <b className="mono">{fmtDateTime(check.file.createdAt)}</b>.{' '}
            <span>Changes made after that time are lost. The activity log is kept. The app restarts and everyone must sign in again.</span>
          </p>
        )}
      </ReauthModal>
    </>
  )
}
