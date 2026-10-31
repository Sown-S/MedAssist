import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import Button from '../../components/Button'
import ReauthModal from '../../components/ReauthModal'
import { Switch } from './ai/ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import {
  useSettings,
  saveSettings,
  saveServerSettings,
  loadServerSettings,
  getSettings,
  changedPaths,
  formatNumber,
  PAPERS,
  PRINT_DOCS,
  NUMBERED_DOCS,
  DATE_PARTS,
  PAYMENT_METHODS,
  ROUNDING,
  WEEKDAYS
} from '../../api/settingsStore'
import { useBackupLog, createBackup, verifyBackupFile, restoreBackup } from '../../api/backupStore'
import { checkHealth, DEMO_MODE } from '../../api/client'
import { fetchPasswordPolicy } from '../../api/accountStore'
import ServerAddress from '../../components/ServerAddress'
import { useDevice, setDevice, getDevice } from '../../api/deviceSettings'
import { printHtml, printHeaderHtml, fmtDateTime, fmtMoney } from './inventory/shared'
import { version } from '../../../../../package.json'

const TABS = [
  { key: 'clinic', label: 'Clinic' },
  { key: 'print', label: 'Printing & numbering' },
  { key: 'security', label: 'Security' },
  { key: 'backup', label: 'Backup & retention' },
  { key: 'connection', label: 'Connection & AI' },
  { key: 'device', label: 'This computer' },
  { key: 'ops', label: 'Operations' }
]
// Tab "Kết nối & AI" chỉ hiển thị trạng thái — không có giá trị lưu.
const TAB_OF = (path) => (path.startsWith('numbering') ? 'print' : path.startsWith('retention') ? 'backup' : path.split('.')[0])

// Khi nào thay đổi có hiệu lực.
const EFFECTS = {
  now: { label: 'Applies immediately', cls: 'ok' },
  signin: { label: 'From next sign-in', cls: 'info' },
  server: { label: 'Applied by the server', cls: 'muted' },
  restart: { label: 'Requires restart', cls: 'warn' }
}

// Nhãn (tiếng Anh, dịch khi hiển thị) + hiệu lực của từng cài đặt. Nhãn cũng dùng cho nhật ký.
const FIELDS = {
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
for (const d of PRINT_DOCS) FIELDS['print.papers.' + d.key] = [`Paper size — ${d.label}`, 'now']
for (const d of NUMBERED_DOCS)
  for (const [k, l] of [['prefix', 'prefix'], ['date', 'date part'], ['digits', 'digits']]) FIELDS[`numbering.${d.key}.${k}`] = [`Numbering — ${d.label} (${l})`, 'now']

const labelOf = (p) => FIELDS[p]?.[0] ?? p
const SECURITY_EXPIRY = [
  { key: 0, label: 'Never' },
  { key: 90, label: 'Every 90 days' },
  { key: 180, label: 'Every 180 days' },
  { key: 365, label: 'Every year' }
]
const IDLE = [
  { key: 0, label: 'Off' },
  { key: 5, label: '5 minutes' },
  { key: 10, label: '10 minutes' },
  { key: 15, label: '15 minutes' },
  { key: 30, label: '30 minutes' },
  { key: 60, label: '60 minutes' }
]
// Giá trị hiển thị trong nhật ký (cũ → mới).
function showValue(p, v) {
  if (p === 'clinic.logo') return v ? '(image)' : '—'
  if (p === 'ops.sellControlled' || p === 'ops.announceName') return v ? 'Yes' : 'No'
  if (p === 'ops.methods') return v.map((k) => PAYMENT_METHODS.find((m) => m.key === k)?.label ?? k).join(', ')
  if (p === 'ops.workDays') return WEEKDAYS.filter((d) => v.includes(d.key)).map((d) => d.label).join(', ')
  if (typeof v === 'boolean') return v
  return v === '' || v == null ? '—' : v
}

function getAt(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}
function setAt(obj, path, value) {
  const [k, ...rest] = path.split('.')
  return { ...obj, [k]: rest.length ? setAt(obj[k], rest.join('.'), value) : value }
}

function validate(d) {
  const e = {}
  const int = (v) => Number.isInteger(Number(v)) && String(v).trim() !== ''
  if (!d.clinic.name.trim()) e['clinic.name'] = 'Enter the clinic name — it is printed on every document.'
  if (d.clinic.email && !/^\S+@\S+\.\S+$/.test(d.clinic.email)) e['clinic.email'] = 'Invalid email address.'
  if (d.clinic.taxCode && !/^\d{10}(-\d{3})?$/.test(d.clinic.taxCode)) e['clinic.taxCode'] = 'A tax code has 10 digits (or 10 digits + "-" + 3 digits for a branch).'
  for (const doc of NUMBERED_DOCS) {
    const r = d.numbering[doc.key]
    if (!/^[A-Z0-9]{0,6}$/.test(r.prefix)) e[`numbering.${doc.key}.prefix`] = 'Use up to 6 capital letters or digits.'
    if (!int(r.digits) || r.digits < 2 || r.digits > 6) e[`numbering.${doc.key}.digits`] = 'Between 2 and 6.'
  }
  const prefixes = NUMBERED_DOCS.map((x) => d.numbering[x.key].prefix).filter(Boolean)
  NUMBERED_DOCS.forEach((x) => {
    const p = d.numbering[x.key].prefix
    if (p && prefixes.filter((y) => y === p).length > 1) e[`numbering.${x.key}.prefix`] = 'Each document type needs its own prefix.'
  })
  if (!int(d.numbering.queueStart) || d.numbering.queueStart < 0) e['numbering.queueStart'] = 'Enter a whole number.'
  if (!int(d.security.minLength) || d.security.minLength < 8 || d.security.minLength > 64) e['security.minLength'] = 'Between 8 and 64 characters.'
  if (!int(d.security.maxFailed) || d.security.maxFailed < 3 || d.security.maxFailed > 20) e['security.maxFailed'] = 'Between 3 and 20 attempts.'
  if (!int(d.security.lockMinutes) || d.security.lockMinutes < 1 || d.security.lockMinutes > 1440) e['security.lockMinutes'] = 'Between 1 and 1440 minutes.'
  if (!int(d.backup.keep) || d.backup.keep < 1 || d.backup.keep > 365) e['backup.keep'] = 'Between 1 and 365.'
  if (d.backup.enabled && !d.backup.path.trim()) e['backup.path'] = 'Enter the folder where backups are stored.'
  if (!int(d.retention.auditYears) || d.retention.auditYears < 1) e['retention.auditYears'] = 'At least 1 year.'
  if (!int(d.retention.recordYears) || d.retention.recordYears < 1) e['retention.recordYears'] = 'At least 1 year.'
  if (d.ops.open >= d.ops.close) e['ops.close'] = 'Closing time must be after opening time.'
  if (!d.ops.workDays.length) e['ops.workDays'] = 'Select at least one working day.'
  if (!int(d.ops.defaultThreshold) || d.ops.defaultThreshold < 0) e['ops.defaultThreshold'] = 'Enter a whole number.'
  if (!int(d.ops.shelfBufferDays ?? 0) || (d.ops.shelfBufferDays ?? 0) < 0 || (d.ops.shelfBufferDays ?? 0) > 365) e['ops.shelfBufferDays'] = 'Enter 0–365 days.'
  if (!int(d.ops.consultFee) || d.ops.consultFee < 0) e['ops.consultFee'] = 'Enter an amount in đồng.'
  if (!d.ops.methods.length) e['ops.methods'] = 'Enable at least one payment method.'
  return e
}

// Ô cài đặt: nhãn + nhãn hiệu lực + dấu "đã sửa" + lỗi.
function Field({ path, hint, error, changed, wide, children }) {
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

export default function SettingsPage({ params, onNavigate, setLeaveGuard }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const saved = useSettings()
  const [tab, setTab] = useState(params?.tab && TABS.some((t) => t.key === params.tab) ? params.tab : 'clinic')
  const [draft, setDraft] = useState(saved.values)
  const [reauth, setReauth] = useState(null)
  // Chính sách mật khẩu và khoá tài khoản của server (chạy thật: chỉ đọc, server ép).
  const [policy, setPolicy] = useState(null)
  // Backend thật: lấy tham số vận hành đang dùng trên server (phí khám, hạn dùng, thông tin phòng khám) rồi làm mới bản nháp.
  useEffect(() => {
    if (DEMO_MODE) return
    loadServerSettings().then(
      () => setDraft(getSettings()),
      (e) => showToast(e.message)
    )
    fetchPasswordPolicy().then(setPolicy)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changed = useMemo(() => new Set(changedPaths(draft)), [draft, saved])
  const errors = useMemo(() => validate(draft), [draft])
  const dirty = changed.size > 0
  const errCount = Object.keys(errors).length

  // Hỏi trước khi rời trang khi còn thay đổi chưa lưu (Admin.jsx gọi hàm này lúc chuyển trang).
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    setLeaveGuard?.(() => dirtyRef.current)
    return () => setLeaveGuard?.(null)
  }, [])

  const val = (p) => getAt(draft, p)
  const set = (p, v) => setDraft((d) => setAt(d, p, v))
  const fp = (p) => ({ path: p, changed: changed.has(p), error: errors[p] })
  const text = (p, extra = {}) => ({ value: val(p) ?? '', onChange: (e) => set(p, e.target.value), ...extra })
  const num = (p) => ({ type: 'number', value: val(p), onChange: (e) => set(p, e.target.value === '' ? '' : Number(e.target.value)) })
  const tabChanged = (k) => [...changed].some((p) => TAB_OF(p) === k)

  async function doSave() {
    setReauth(null)
    // Backend thật: ghi tham số vận hành lên server trước; lỗi thì không lưu gì ở máy này.
    const r = await saveServerSettings(draft)
    if (!r.ok) return showToast(translate(r.error))
    const n = saveSettings(draft, user, labelOf, showValue)
    showToast(n ? 'Settings saved' : 'No changes')
  }
  function save() {
    if (errCount) return showToast('Fix the highlighted fields before saving')
    if ([...changed].some((p) => p.startsWith('security.') || p.startsWith('backup.') || p.startsWith('retention.'))) return setReauth(true)
    doSave()
  }

  function onLogo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(f.type)) return showToast('Choose a PNG, JPG, SVG or WebP image')
    if (f.size > 300 * 1024) return showToast('The logo must be smaller than 300 KB')
    const r = new FileReader()
    r.onload = () => set('clinic.logo', r.result)
    r.readAsDataURL(f)
  }

  return (
    <div className="settings-page">
      <div className="page-head">
        <div>
          <h1>System settings</h1>
          <p>Settings for the whole clinic. Each change is recorded in the activity log with the old and new value.</p>
        </div>
        <div className="ai-toolbar-right">
          {saved.updatedAt && (
            <span className="ai-small ai-soft">
              <span>Last saved</span> <span className="mono">{fmtDateTime(saved.updatedAt)}</span> <span>by</span> <b>{saved.updatedBy}</b>
            </span>
          )}
        </div>
      </div>

      <div className="itabs ai-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={'itab' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
            {t.label}
            {tabChanged(t.key) && <span className="set-dot" title="Unsaved changes" />}
          </button>
        ))}
      </div>

      {tab === 'clinic' && (
        <div className="card">
          <p className="ai-soft ai-small set-intro">Printed on prescriptions, invoices and reports.</p>
          <div className="set-grid">
            <Field {...fp('clinic.name')} wide>
              <input {...text('clinic.name')} placeholder="e.g. Phòng khám Đa khoa An Bình" />
            </Field>
            <Field {...fp('clinic.address')} wide>
              <input {...text('clinic.address')} />
            </Field>
            <Field {...fp('clinic.phone')}>
              <input {...text('clinic.phone', { inputMode: 'tel' })} />
            </Field>
            <Field {...fp('clinic.email')}>
              <input {...text('clinic.email', { type: 'email' })} />
            </Field>
            <Field {...fp('clinic.taxCode')}>
              <input {...text('clinic.taxCode', { inputMode: 'numeric' })} />
            </Field>
            <Field {...fp('clinic.licenseNo')}>
              <input {...text('clinic.licenseNo')} />
            </Field>
            <Field {...fp('clinic.licenseDate')}>
              <input {...text('clinic.licenseDate', { type: 'date' })} />
            </Field>
            <Field {...fp('clinic.licenseIssuer')}>
              <input {...text('clinic.licenseIssuer')} placeholder="e.g. Sở Y tế Đà Nẵng" />
            </Field>
            <Field {...fp('clinic.director')}>
              <input {...text('clinic.director')} />
            </Field>
            <Field {...fp('clinic.directorLicense')}>
              <input {...text('clinic.directorLicense')} />
            </Field>
            <Field {...fp('clinic.logo')} wide hint="PNG, JPG, SVG or WebP, under 300 KB.">
              <div className="set-logo">
                {val('clinic.logo') ? <img src={val('clinic.logo')} alt="" /> : <span className="ai-soft ai-small">No logo</span>}
                <label className="btn btn-ghost btn-sm">
                  <Icon name="paperclip" /> <span>Choose image</span>
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={onLogo} />
                </label>
                {val('clinic.logo') && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('clinic.logo', '')}>
                    Remove
                  </button>
                )}
              </div>
            </Field>
          </div>
        </div>
      )}

      {tab === 'print' && (
        <>
          <div className="card">
            <div className="card-title">Templates &amp; paper size</div>
            <div className="set-split">
              <div>
                <p className="ai-soft" style={{ fontSize: 13, marginTop: 0 }}>
                  {translate('Paper sizes and printers are set per computer — see the “This computer” tab.')}
                </p>
                <div className="set-grid" style={{ marginTop: 14 }}>
                  <Field {...fp('print.showLogo')}>
                    <Switch checked={val('print.showLogo')} onChange={(v) => set('print.showLogo', v)} />
                  </Field>
                  <Field {...fp('print.header')} wide hint="Optional, e.g. opening hours or a hotline. Shown under the clinic details.">
                    <input {...text('print.header')} />
                  </Field>
                  <Field {...fp('print.footer')} wide>
                    <input {...text('print.footer')} />
                  </Field>
                </div>
              </div>
              <div>
                <div className="ai-small ai-soft" style={{ marginBottom: 6 }}>
                  Header preview
                </div>
                <div className="set-print-preview" dangerouslySetInnerHTML={{ __html: printHeaderHtml(draft) }} />
                {val('print.footer') && <div className="set-print-preview foot">{val('print.footer')}</div>}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-title">Document numbering</div>
            <p className="ai-soft" style={{ fontSize: 13, margin: 0 }}>
              {translate('Read-only: the clinic server numbers documents when they are saved (e.g. invoices HD-20261017-0001) and issues queue numbers, so two computers never get the same number.')}
            </p>
          </div>
        </>
      )}

      {tab === 'security' && (
        <div className="card">
          <div className="set-grid">
            {DEMO_MODE ? (
              <>
                <Field {...fp('security.minLength')} hint="Checked when a password is set or changed.">
                  <input {...num('security.minLength')} min="8" max="64" />
                </Field>
                <Field {...fp('security.requireMix')}>
                  <Switch checked={val('security.requireMix')} onChange={(v) => set('security.requireMix', v)} />
                </Field>
                <Field {...fp('security.expiryDays')} hint="When a password is older than this, the user must set a new one at sign-in.">
                  <select value={val('security.expiryDays')} onChange={(e) => set('security.expiryDays', Number(e.target.value))}>
                    {SECURITY_EXPIRY.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              // Chạy thật: server ép chính sách mật khẩu (GET /auth/password-policy) — chỉ hiển thị, không sửa ở đây.
              <Field path="security.policy" wide hint="Fixed on the clinic server — shown for reference only.">
                <div className="symptom-box" style={{ padding: '8px 11px', fontSize: 13.5 }}>
                  {policy
                    ? translate(`At least ${policy.minLength} characters`) + (policy.requireMix ? ' · ' + translate('letters and digits') : '')
                    : translate('Cannot read the password policy from the server.')}
                </div>
              </Field>
            )}
            <Field path="security.lock" wide hint="Fixed on the clinic server — shown for reference only. Administrators can unlock earlier in Staff accounts.">
              <div className="symptom-box" style={{ padding: '8px 11px', fontSize: 13.5 }}>
                {policy
                  ? translate(`${policy.maxFailed} wrong passwords within ${policy.failedWindow} minutes → the account is locked for ${policy.lockMinutes} minutes.`)
                  : translate('5 wrong passwords within 15 minutes (20 from one computer) → the account is locked for 5 minutes.')}
              </div>
            </Field>
            <Field {...fp('security.idleMinutes')} hint="Recommended on shared clinic computers: patient data stays on screen otherwise.">
              <select value={val('security.idleMinutes')} onChange={(e) => set('security.idleMinutes', Number(e.target.value))}>
                {IDLE.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="ai-foot-note">
            <Icon name="lock" /> <span>Saving security settings asks for your password. The server enforces the same rules — the interface only mirrors them.</span>
          </p>
        </div>
      )}

      {tab === 'backup' && <BackupTab user={user} fp={fp} val={val} set={set} text={text} num={num} onNavigate={onNavigate} showToast={showToast} />}

      {tab === 'connection' && <ConnectionTab onNavigate={onNavigate} />}
      {tab === 'device' && <DeviceTab draft={draft} />}

      {tab === 'ops' && (
        <div className="card">
          <div className="section-label" style={{ marginTop: 0 }}>
            Working hours
          </div>
          <div className="set-grid">
            <Field {...fp('ops.open')}>
              <input {...text('ops.open', { type: 'time' })} />
            </Field>
            <Field {...fp('ops.close')}>
              <input {...text('ops.close', { type: 'time' })} />
            </Field>
            <Field {...fp('ops.workDays')} wide>
              <div className="ai-seg">
                {WEEKDAYS.map((d) => {
                  const on = val('ops.workDays').includes(d.key)
                  return (
                    <button
                      key={d.key}
                      type="button"
                      className={on ? 'active' : ''}
                      onClick={() => set('ops.workDays', on ? val('ops.workDays').filter((x) => x !== d.key) : [...val('ops.workDays'), d.key])}
                    >
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </Field>
          </div>

          <div className="section-label">Inventory</div>
          <div className="set-grid">
            <Field {...fp('ops.nearDays')} hint="Batches expiring within this period are flagged on Home and in Stock & expiry.">
              <div className="ai-seg">
                {[30, 60, 90].map((n) => (
                  <button key={n} type="button" className={val('ops.nearDays') === n ? 'active' : ''} onClick={() => set('ops.nearDays', n)}>
                    {n} <span>days</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field {...fp('ops.shelfBufferDays')} hint="When a prescription is confirmed, only batches that stay valid until today + the course length (or this many days, whichever is longer) are used.">
              <input {...num('ops.shelfBufferDays')} min="0" max="365" />
            </Field>
            <Field {...fp('ops.defaultThreshold')} hint="Pre-filled when a new drug is added; each drug can still have its own threshold.">
              <input {...num('ops.defaultThreshold')} min="0" />
            </Field>
          </div>

          <div className="section-label">Payments</div>
          <div className="set-grid">
            <Field {...fp('ops.consultFee')} hint={fmtMoney(Number(val('ops.consultFee')) || 0)}>
              <input {...num('ops.consultFee')} min="0" step="1000" />
            </Field>
            <Field {...fp('ops.sellControlled')} wide hint="Off: doctors still write separate N/H prescriptions, but the clinic pharmacy does not invoice or dispense them — patients buy them at a licensed outside pharmacy.">
              <label className="set-checks" style={{ display: 'flex' }}>
                <input type="checkbox" checked={!!val('ops.sellControlled')} onChange={(e) => set('ops.sellControlled', e.target.checked)} /> <span>The clinic pharmacy is licensed to sell narcotic / psychotropic drugs</span>
              </label>
            </Field>
            <Field {...fp('ops.methods')} wide>
              <div className="set-checks">
                {PAYMENT_METHODS.map((m) => {
                  const on = val('ops.methods').includes(m.key)
                  return (
                    <label key={m.key}>
                      <input type="checkbox" checked={on} onChange={() => set('ops.methods', on ? val('ops.methods').filter((x) => x !== m.key) : [...val('ops.methods'), m.key])} />{' '}
                      <span>{m.label}</span>
                    </label>
                  )
                })}
              </div>
            </Field>
          </div>
        </div>
      )}

      {(dirty || errCount > 0) && tab !== 'connection' && (
        <div className="set-savebar">
          <span>
            {errCount > 0 ? (
              <span className="set-err">
                <span className="mono">{errCount}</span> <span>fields need fixing</span>
              </span>
            ) : (
              <>
                <span className="mono">{changed.size}</span> <span>unsaved changes</span>
              </>
            )}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={!dirty} onClick={() => setDraft(saved.values)}>
            Discard changes
          </button>
          <button className="btn btn-primary btn-sm" disabled={!dirty || errCount > 0} onClick={save}>
            <Icon name="save" /> <span>Save</span>
          </button>
        </div>
      )}

      <ReauthModal open={!!reauth} title="Save security & backup settings" confirmLabel="Save" onClose={() => setReauth(null)} onConfirm={doSave}>
        <p className="ai-soft">These settings protect patient data. Confirm with your password.</p>
        <ul className="perm-diff">
          {[...changed].map((p) => (
            <li key={p}>
              <span>{labelOf(p)}</span>
            </li>
          ))}
        </ul>
      </ReauthModal>
    </div>
  )
}

// Cài đặt riêng máy này (khổ giấy, bảng gọi bệnh nhân) — lưu ngay trên máy, không qua nút Lưu chung.
function DeviceTab({ draft }) {
  const dev = useDevice()
  return (
    <>
      <div className="card">
        <div className="card-title">Paper size on this computer</div>
        <table className="dt">
          <thead>
            <tr>
              <th>Document</th>
              <th>Paper size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {PRINT_DOCS.map((d) => (
              <tr key={d.key}>
                <td>{d.label}</td>
                <td>
                  <select className="ai-select" value={dev.papers[d.key]} onChange={(e) => setDevice({ papers: { [d.key]: e.target.value } })}>
                    {PAPERS.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="ai-actions">
                  <button className="btn btn-ghost btn-sm" title="Print a test page" onClick={() => printTest(d, draft)}>
                    <Icon name="printer" /> <span>Test</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ai-foot-note">
          <Icon name="settings" /> <span>Saved on this computer only — e.g. the front-desk PC prints receipts on an 80 mm thermal printer, the doctor’s PC prints prescriptions on A5.</span>
        </p>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Patient call board (front desk)</div>
        <div className="set-grid">
          <div className="field set-field">
            <label>
              <span>Show patient names</span>
            </label>
            <Switch checked={dev.queue.showNames} onChange={(v) => setDevice({ queue: { showNames: v } })} />
            <small className="ai-soft">Turn off if this screen faces the waiting room — only the number and room are shown.</small>
          </div>
          <div className="field set-field">
            <label>
              <span>Next patients shown</span>
            </label>
            <select value={dev.queue.nextCount} onChange={(e) => setDevice({ queue: { nextCount: Number(e.target.value) } })}>
              {[3, 6, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </>
  )
}

function printTest(doc, draft) {
  const t = translate
  printHtml(
    t('Test page'),
    `<h1>${t('Test page')} — ${t(doc.label)}</h1><p class="meta">${t('Paper size')}: ${getDevice().papers[doc.key]}</p>
    <table><thead><tr><th>${t('Item')}</th><th class="num">${t('Amount')}</th></tr></thead>
    <tbody><tr><td>${t('Consultation fee')}</td><td class="num">${fmtMoney(draft.ops.consultFee)}</td></tr></tbody></table>`,
    doc.key,
    draft
  )
}

function BackupTab({ user, fp, val, set, text, num, onNavigate, showToast }) {
  const log = useBackupLog()
  const [check, setCheck] = useState(null) // kết quả kiểm tra file
  const [mode, setMode] = useState('verify') // 'verify' | 'restore'
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
      {/* Chạy thật: máy chủ tự sao lưu hằng ngày (deploy/scripts/backup.ps1); khôi phục = dựng CSDL mới rồi hoán đổi
          (restore.ps1), không làm qua API → chỉ hiện hướng dẫn, không có nút sao lưu / khôi phục. */}
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

function ConnectionTab({ onNavigate }) {
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
            <div className="ai-small ai-soft">
              {DEMO_MODE && <span className="badge warn set-inline">Demo mode — sample data, no server</span>}
            </div>
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
              {health.sample && (
                <>
                  {' · '}
                  <span>Sample data</span>
                </>
              )}
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
        <p className="ai-soft ai-small">Rules, thresholds and drug interactions are managed on the AI configuration page.</p>
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
