import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { Field } from './Field'

export function BackupTab({ fp, num, onNavigate }) {
  return (
    <>
      {/* Máy chủ tự sao lưu hằng ngày (backup.ps1); khôi phục = dựng CSDL mới rồi hoán đổi (restore.ps1), không làm qua API → chỉ hiện hướng dẫn. */}
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

    </>
  )
}
