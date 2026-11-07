import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import ReauthModal from '../../components/ReauthModal'
import { Switch } from './ui'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { useSettings, saveSettings, saveServerSettings, loadServerSettings, loadClientConfig, getSettings, changedPaths, isServerSetting, PRINT_DOCS } from '../../api/settingsStore'
import { useServerOnline } from '../../api/connectivity'
import { fetchPasswordPolicy } from '../../api/accountStore'
import { printHeaderHtml, fmtDateTime } from './inventory/shared'
import { DeviceTab } from './settings/DeviceTab'
import { FIELDS, Field } from './settings/Field'
import { ConnectionTab } from './settings/ConnectionTab'
import { ClinicTab } from './settings/ClinicTab'
import { OpsTab } from './settings/OpsTab'
import { IDLE, getAt, setAt, validate } from './settings/settingsForm'

const TABS = [
  { key: 'clinic', label: 'Clinic' },
  { key: 'print', label: 'Printing & numbering' },
  { key: 'security', label: 'Security' },
  { key: 'connection', label: 'Connection & AI' },
  { key: 'device', label: 'This computer' },
  { key: 'ops', label: 'Operations' }
]
// Tab “Kết nối & AI” chỉ hiển thị trạng thái, không có giá trị lưu.
const TAB_OF = (path) => path.split('.')[0]

for (const d of PRINT_DOCS) FIELDS['print.papers.' + d.key] = [`Paper size — ${d.label}`, 'now']

const labelOf = (p) => FIELDS[p]?.[0] ?? p
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
      (e) => showToast(e.message, 'error')
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
  // Mất kết nối: không sửa được phần lưu trên server (thông tin phòng khám, tự đăng xuất...), như chế độ chỉ đọc chung.
  const online = useServerOnline()
  const blockedOffline = !online && [...changed].some(isServerSetting)
  const idleNow = getAt(draft, 'security.idleMinutes')
  const idleOptions = IDLE.some((x) => x.key === idleNow) ? IDLE : [...IDLE, { key: idleNow, label: `${idleNow} minutes` }]

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
  const form = { fp, text, num, val, set }
  const tabChanged = (k) => [...changed].some((p) => TAB_OF(p) === k)

  async function doSave() {
    setReauth(null)
    // Ghi tham số lên server trước; lỗi thì không lưu gì ở máy này.
    const r = await saveServerSettings(draft)
    if (!r.ok) return showToast(translate(r.error), 'error')
    const n = saveSettings(draft, user)
    // Làm mới bản đệm dùng chung (in phiếu, tự đăng xuất) theo đúng giá trị server vừa lưu.
    loadClientConfig()
    showToast(n ? 'Settings saved' : 'No changes')
  }
  function save() {
    if (errCount) return showToast('Fix the highlighted fields before saving', 'error')
    if ([...changed].some((p) => p.startsWith('security.'))) return setReauth(true)
    doSave()
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

      {tab === 'clinic' && <ClinicTab form={form} readOnly={!online} />}

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
              <select value={idleNow} disabled={!online} onChange={(e) => set('security.idleMinutes', Number(e.target.value))}>
                {idleOptions.map((x) => (
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

      {tab === 'connection' && <ConnectionTab onNavigate={onNavigate} />}
      {tab === 'device' && <DeviceTab draft={draft} />}

      {tab === 'ops' && <OpsTab form={form} />}

      {(dirty || errCount > 0) && tab !== 'connection' && (
        <div className="set-savebar">
          <span>
            {errCount > 0 ? (
              <span className="set-err">
                <span className="mono">{errCount}</span> <span>fields need fixing</span>
              </span>
            ) : blockedOffline ? (
              <span className="set-err">No connection to the clinic server — clinic details and shared settings cannot be saved now.</span>
            ) : (
              <>
                <span className="mono">{changed.size}</span> <span>unsaved changes</span>
              </>
            )}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={!dirty} onClick={() => setDraft(saved.values)}>
            Discard changes
          </button>
          <button className="btn btn-primary btn-sm" disabled={!dirty || errCount > 0 || blockedOffline} onClick={save}>
            <Icon name="save" /> <span>Save</span>
          </button>
        </div>
      )}

      <ReauthModal open={!!reauth} title="Save security settings" confirmLabel="Save" onClose={() => setReauth(null)} onConfirm={doSave}>
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

