import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import ReauthModal from '../../components/ReauthModal'
import { Switch } from './ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { useSettings, saveSettings, saveServerSettings, loadServerSettings, getSettings, changedPaths, PRINT_DOCS, NUMBERED_DOCS, PAYMENT_METHODS, WEEKDAYS } from '../../api/settingsStore'
import { fetchPasswordPolicy } from '../../api/accountStore'
import { printHeaderHtml, fmtDateTime, fmtMoney } from './inventory/shared'
import { DeviceTab } from './settings/DeviceTab'
import { FIELDS, Field } from './settings/Field'
import { BackupTab } from './settings/BackupTab'
import { ConnectionTab } from './settings/ConnectionTab'

const TABS = [
  { key: 'clinic', label: 'Clinic' },
  { key: 'print', label: 'Printing & numbering' },
  { key: 'security', label: 'Security' },
  { key: 'backup', label: 'Backup & retention' },
  { key: 'connection', label: 'Connection & AI' },
  { key: 'device', label: 'This computer' },
  { key: 'ops', label: 'Operations' }
]
// Tab “Kết nối & AI” chỉ hiển thị trạng thái, không có giá trị lưu.
const TAB_OF = (path) => (path.startsWith('numbering') ? 'print' : path.startsWith('retention') ? 'backup' : path.split('.')[0])

for (const d of PRINT_DOCS) FIELDS['print.papers.' + d.key] = [`Paper size — ${d.label}`, 'now']
for (const d of NUMBERED_DOCS)
  for (const [k, l] of [['prefix', 'prefix'], ['date', 'date part'], ['digits', 'digits']]) FIELDS[`numbering.${d.key}.${k}`] = [`Numbering — ${d.label} (${l})`, 'now']

const labelOf = (p) => FIELDS[p]?.[0] ?? p
const IDLE = [
  { key: 0, label: 'Off' },
  { key: 5, label: '5 minutes' },
  { key: 10, label: '10 minutes' },
  { key: 15, label: '15 minutes' },
  { key: 30, label: '30 minutes' },
  { key: 60, label: '60 minutes' }
]
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

export default function SettingsPage({ params, onNavigate, setLeaveGuard }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const saved = useSettings()
  const [tab, setTab] = useState(params?.tab && TABS.some((t) => t.key === params.tab) ? params.tab : 'clinic')
  const [draft, setDraft] = useState(saved.values)
  const [reauth, setReauth] = useState(null)
  const [policy, setPolicy] = useState(null)
  // Nạp tham số đang dùng trên server rồi làm mới bản nháp.
  useEffect(() => {
    loadServerSettings().then(
      () => setDraft(getSettings()),
      (e) => showToast(e.message)
    )
    fetchPasswordPolicy().then(setPolicy)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tính lại cả khi vừa lưu xong (saved đổi) dù không dùng trong hàm.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const changed = useMemo(() => new Set(changedPaths(draft)), [draft, saved])
  const errors = useMemo(() => validate(draft), [draft])
  const dirty = changed.size > 0
  const errCount = Object.keys(errors).length

  // Hỏi trước khi rời trang khi còn thay đổi chưa lưu (Admin.jsx gọi lúc chuyển trang).
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    setLeaveGuard?.(() => dirtyRef.current)
    return () => setLeaveGuard?.(null)
  }, [setLeaveGuard])

  const val = (p) => getAt(draft, p)
  const set = (p, v) => setDraft((d) => setAt(d, p, v))
  const fp = (p) => ({ path: p, changed: changed.has(p), error: errors[p] })
  const text = (p, extra = {}) => ({ value: val(p) ?? '', onChange: (e) => set(p, e.target.value), ...extra })
  const num = (p) => ({ type: 'number', value: val(p), onChange: (e) => set(p, e.target.value === '' ? '' : Number(e.target.value)) })
  const tabChanged = (k) => [...changed].some((p) => TAB_OF(p) === k)

  async function doSave() {
    setReauth(null)
    // Ghi tham số lên server trước; lỗi thì không lưu gì ở máy này.
    const r = await saveServerSettings(draft)
    if (!r.ok) return showToast(translate(r.error))
    const n = saveSettings(draft, user)
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
            {/* Chính sách mật khẩu do server quy định — chỉ hiển thị. */}
            <Field path="security.policy" wide hint="Fixed on the clinic server — shown for reference only.">
              <div className="symptom-box" style={{ padding: '8px 11px', fontSize: 13.5 }}>
                {policy
                  ? translate(`At least ${policy.minLength} characters`) + (policy.requireMix ? ' · ' + translate('letters and digits') : '')
                  : translate('Cannot read the password policy from the server.')}
              </div>
            </Field>
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

      {tab === 'backup' && <BackupTab fp={fp} num={num} onNavigate={onNavigate} />}

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

