

// Khi nào thay đổi có hiệu lực.
export const EFFECTS = {
  now: { label: 'Applies immediately', cls: 'ok' },
  signin: { label: 'From next sign-in', cls: 'info' },
  server: { label: 'Applied by the server', cls: 'muted' },
  restart: { label: 'Requires restart', cls: 'warn' }
}

// Nhãn (tiếng Anh, dịch khi hiển thị) + hiệu lực của từng cài đặt. Nhãn cũng dùng cho nhật ký.
export const FIELDS = {
  'clinic.name': ['Clinic name', 'now'],
  'clinic.address': ['Address', 'now'],
  'clinic.phone': ['Phone', 'now'],
  'clinic.email': ['Email', 'now'],
  'clinic.taxCode': ['Tax code', 'now'],
  'clinic.licenseNo': ['Operating licence no.', 'now'],
  'clinic.licenseDate': ['Licence issue date', 'now'],
  'clinic.licenseIssuer': ['Issued by', 'now'],
  'clinic.director': ['Person in charge of medical expertise', 'now'],
  'clinic.directorLicense': ['Their practising licence no.', 'now'],
  'clinic.logo': ['Logo', 'now'],
  'print.showLogo': ['Show logo on printouts', 'now'],
  'print.header': ['Extra header line', 'now'],
  'print.footer': ['Footer', 'now'],
  'numbering.queueResetAt': ['Queue number resets at', 'server'],
  'numbering.queueStart': ['First queue number of the day', 'server'],
  'security.minLength': ['Minimum password length', 'now'],
  'security.requireMix': ['Require letters and digits', 'now'],
  'security.expiryDays': ['Password expiry', 'signin'],
  'security.maxFailed': ['Lock after failed sign-ins', 'now'],
  'security.lockMinutes': ['Lock duration (minutes)', 'now'],
  'security.lock': ['Sign-in lock', 'server'],
  'security.policy': ['Password rules', 'server'],
  'backup.server': ['Automatic backup', 'server'],
  'security.idleMinutes': ['Sign out after inactivity', 'now'],
  'backup.enabled': ['Automatic backup', 'server'],
  'backup.time': ['Backup time', 'server'],
  'backup.keep': ['Backups to keep', 'server'],
  'backup.path': ['Backup folder (on the server)', 'server'],
  'backup.offsite': ['Second copy (external drive / NAS)', 'server'],
  'retention.auditYears': ['Keep the activity log for', 'server'],
  'retention.recordYears': ['Keep medical records for', 'server'],
  'ops.open': ['Opening time', 'now'],
  'ops.close': ['Closing time', 'now'],
  'ops.workDays': ['Working days', 'now'],
  'ops.nearDays': ['Near-expiry warning', 'now'],
  'ops.shelfBufferDays': ['Expiry safety buffer', 'now'],
  'ops.defaultThreshold': ['Default minimum stock', 'now'],
  'ops.consultFee': ['Default consultation fee', 'now'],
  'ops.methods': ['Payment methods', 'now'],
  'ops.sellControlled': ['Pharmacy sells controlled (N/H) drugs', 'now'],
  'ops.announceName': ['Read the patient’s name aloud when calling', 'now']
}

// Ô cài đặt: nhãn + nhãn hiệu lực + dấu "đã sửa" + lỗi.
export function Field({ path, hint, error, changed, wide, children }) {
  const [label, effect] = FIELDS[path] ?? [path, 'now']
  const ef = EFFECTS[effect]
  return (
    <div className={'field set-field' + (wide ? ' wide' : '') + (changed ? ' changed' : '') + (error ? ' has-err' : '')}>
      <label>
        <span>{label}</span>
        <span className={'badge ' + ef.cls + ' set-effect'}>{ef.label}</span>
      </label>
      {children}
      {error ? <small className="set-err">{error}</small> : hint && <small className="ai-soft">{hint}</small>}
    </div>
  )
}
