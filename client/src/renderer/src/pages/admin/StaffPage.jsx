import { useEffect, useMemo, useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import ReauthModal from '../../components/ReauthModal'
import ChangePasswordModal from '../../components/ChangePasswordModal'
import Icon from '../../components/Icon'
import Button from '../../components/Button'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import {
  ROLES,
  maxFailed,
  hasDefaultName,
  listAccounts,
  createAccount,
  updateAccount,
  setActive,
  resetPassword,
  unlockAccount,
  forceSignOut
} from '../../api/accountStore'
import { DEMO_MODE } from '../../api/client'
import { logEvent } from '../../api/activityStore'
import { listRooms, examRooms } from '../../api/roomStore'
import { fmtDate, fmtDateTime } from './inventory/shared'
import { translate } from '../../i18n'

const EMPTY = { fullName: '', username: '', roleKey: 'doctor', phone: '', staffCode: '', roomId: null, licenseNo: '' }
// Không đăng nhập quá bấy nhiêu ngày → coi là tài khoản bỏ không, nên xem xét vô hiệu hoá.
const IDLE_DAYS = 30

const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null)
const isIdle = (a) => a.active && (a.lastLoginAt ? daysSince(a.lastLoginAt) >= IDLE_DAYS : daysSince(a.createdAt) >= IDLE_DAYS)

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Password change pending' },
  { key: 'locked', label: 'Locked' },
  { key: 'idle', label: 'Unused' },
  { key: 'disabled', label: 'Disabled' }
]
function matchStatus(a, f) {
  if (f === 'active') return a.active && !a.locked
  if (f === 'pending') return a.mustChange
  if (f === 'locked') return a.locked
  if (f === 'idle') return isIdle(a)
  if (f === 'disabled') return !a.active
  return true
}

// Trường thay đổi khi sửa — nhãn tiếng Anh, được dịch khi hiển thị nhật ký.
const FIELD_LABELS = { fullName: 'Full name', staffCode: 'Staff code', phone: 'Phone', roomId: 'Consultation room', licenseNo: 'Practising licence no.' }

export default function StaffPage() {
  const { showToast } = useToast()
  const { user: me, refreshUser } = useAuth()
  // Phòng khám để gán cho bác sĩ (GET /rooms): mỗi phòng khám chỉ một bác sĩ đang hoạt động.
  const [rooms, setRooms] = useState([])

  const [accounts, setAccounts] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const [form, setForm] = useState(null) // null = đóng; có id = đang sửa
  const [formErr, setFormErr] = useState('')
  const [reauth, setReauth] = useState(null) // { title, message, confirmLabel, danger, run }
  const [secret, setSecret] = useState(null) // { account, password, reset } — mật khẩu tạm, chỉ hiện 1 lần
  const [ownPw, setOwnPw] = useState(false)
  const [confirm, setConfirm] = useState(null) // { title, message, confirmLabel, run }

  async function refresh() {
    try {
      const list = await listAccounts()
      setAccounts(list)
      setRooms(examRooms(await listRooms({ accounts: list })))
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => {
    refresh()
  }, [])

  const editing = form?.id ? accounts?.find((a) => a.id === form.id) : null
  const target = (a) => ({ target: { kind: 'account', id: a.username, label: a.fullName } })

  // ---------- Tạo / sửa ----------
  function openCreate(roleKey = 'doctor') {
    setFormErr('')
    setForm({ ...EMPTY, roleKey })
  }
  function openEdit(a) {
    setFormErr('')
    setForm({ ...EMPTY, ...a })
  }
  function submitForm(e) {
    e.preventDefault()
    if (!form.fullName.trim() || !form.username.trim()) return setFormErr('Please enter a full name and username.')
    if (!editing) {
      if (form.roleKey === 'admin')
        return setReauth({
          title: 'Create an administrator account',
          message: 'Administrators can manage accounts, permissions and all system settings. Confirm with your password.',
          confirmLabel: 'Create account',
          run: doCreate
        })
      return doCreate()
    }
    if (form.roleKey !== editing.roleKey)
      return setReauth({
        title: 'Change role',
        message: 'Changing the role changes what this person can see and do. Their open sessions end and they must sign in again with the new role.',
        roleChange: [editing.roleKey, form.roleKey],
        confirmLabel: 'Change role',
        danger: true,
        run: doUpdate
      })
    doUpdate()
  }
  async function doCreate() {
    setReauth(null)
    const res = await createAccount(form, me)
    if (!res.ok) return setFormErr(res.error)
    const a = res.account
    logEvent(me, 'account.create', { ...target(a), params: { account: a.username, role: a.roleKey } })
    showToast(`Account ${a.username} created`)
    setForm(null)
    setSecret({ account: a, password: res.password })
    refresh()
  }
  async function doUpdate() {
    setReauth(null)
    const res = await updateAccount(form.id, form)
    if (!res.ok) return setFormErr(res.error)
    const { before, account: a } = res
    const fields = Object.keys(FIELD_LABELS).filter((k) => (before[k] ?? '') !== (a[k] ?? ''))
    if (fields.length)
      logEvent(me, 'account.update', {
        ...target(a),
        params: { account: a.username, fields: fields.map((k) => FIELD_LABELS[k]) },
        before: fields.includes('fullName') ? before.fullName : null,
        after: fields.includes('fullName') ? a.fullName : null
      })
    if (before.roleKey !== a.roleKey) logEvent(me, 'account.role_change', { ...target(a), params: { account: a.username, from: before.roleKey, to: a.roleKey } })
    if (a.id === me.id) refreshUser(a)
    showToast(fields.length || before.roleKey !== a.roleKey ? 'Account updated' : 'No changes')
    setForm(null)
    refresh()
  }

  // ---------- Mật khẩu, khoá, phiên ----------
  function askReset(a) {
    setReauth({
      title: `Reset password — ${a.username}`,
      message: 'A new temporary password will be generated and shown once. The account is unlocked, its open sessions end, and the staff member must change the password at next sign-in.',
      confirmLabel: 'Reset',
      danger: true,
      run: async () => {
        setReauth(null)
        const res = await resetPassword(a.id)
        if (!res.ok) return showToast(res.error)
        logEvent(me, 'account.reset_password', { ...target(a), params: { account: a.username } })
        setSecret({ account: a, password: res.password, reset: true })
        refresh()
      }
    })
  }
  async function unlock(a) {
    const res = await unlockAccount(a.id)
    if (!res.ok) return showToast(res.error)
    logEvent(me, 'account.unlock', { ...target(a), params: { account: a.username } })
    showToast('Account unlocked')
    refresh()
  }
  function askForceSignOut(a) {
    setConfirm({
      title: `Force sign-out — ${a.username}`,
      message: 'Every open session of this account ends within a few seconds. If you suspect the password has leaked, also reset the password.',
      confirmLabel: 'Sign out now',
      run: async () => {
        setConfirm(null)
        const res = await forceSignOut(a.id)
        if (!res.ok) return showToast(res.error)
        logEvent(me, 'account.force_logout', { ...target(a), params: { account: a.username } })
        showToast('Sessions ended')
        refresh()
      }
    })
  }
  async function toggle(a) {
    const res = await setActive(a.id, !a.active)
    if (!res.ok) return showToast(res.error)
    logEvent(me, a.active ? 'account.disable' : 'account.enable', { ...target(a), params: { account: a.username }, before: a.active, after: !a.active })
    showToast(a.active ? 'Account disabled' : 'Account re-enabled')
    refresh()
  }

  // ---------- Lọc ----------
  const counts = useMemo(() => {
    const c = { locked: 0, pending: 0, idle: 0 }
    for (const k of Object.keys(ROLES)) c[k] = { total: 0, active: 0 }
    for (const a of accounts ?? []) {
      c[a.roleKey].total++
      if (a.active) c[a.roleKey].active++
      if (a.locked) c.locked++
      if (a.mustChange) c.pending++
      if (isIdle(a)) c.idle++
    }
    return c
  }, [accounts])

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (accounts ?? []).filter(
      (a) =>
        (roleFilter === 'all' || a.roleKey === roleFilter) &&
        matchStatus(a, statusFilter) &&
        (!t || [a.fullName, a.username, a.staffCode, a.phone, a.licenseNo].some((x) => (x ?? '').toLowerCase().includes(t)))
    )
  }, [accounts, q, roleFilter, statusFilter])

  const noStaffYet = accounts && !accounts.some((a) => a.roleKey !== 'admin')
  const meAccount = accounts?.find((a) => a.id === me.id)

  return (
    <div>
      <div className="breadcrumb">
        Roles &amp; permissions / <b>Staff accounts</b>
      </div>
      <div className="page-head">
        <div>
          <h1>Staff accounts</h1>
          <p>Create and manage Doctor, Receptionist and Administrator accounts. Only administrators can create accounts.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openCreate()}>
          + New account
        </button>
      </div>

      {!accounts && !error && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}

      {accounts && (
        <>
          {meAccount && hasDefaultName(meAccount) && (
            <div className="card staff-callout">
              <Icon name="user" />
              <div>
                <b>Your account still has the default name “System Administrator”.</b>
                <div className="ai-soft ai-small">Change it to your real name so the activity log shows who did what.</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(meAccount)}>
                <Icon name="pencil" /> <span>Edit my details</span>
              </button>
            </div>
          )}

          {noStaffYet && (
            <div className="card staff-callout">
              <Icon name="users" />
              <div>
                <b>Create the first accounts for Doctor and Receptionist</b>
                <div className="ai-soft ai-small">Only the administrator account exists so far. Each staff member should have their own account.</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => openCreate('doctor')}>
                + Doctor account
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => openCreate('reception')}>
                + Receptionist account
              </button>
            </div>
          )}

          <div className="ai-summary">
            {Object.entries(ROLES).map(([k, r]) => (
              <button key={k} className={'stat-card ai-sum-card' + (roleFilter === k ? ' staff-sum-on' : '')} onClick={() => setRoleFilter(roleFilter === k ? 'all' : k)}>
                <div className="dot" />
                <div>
                  <div className="val">{counts[k].total}</div>
                  <div className="lbl">{r.label}</div>
                  <div className="ai-small ai-soft">
                    <span className="mono">{counts[k].active}</span> <span>active</span>
                  </div>
                </div>
              </button>
            ))}
            <button className={'stat-card ai-sum-card' + (statusFilter === 'pending' ? ' staff-sum-on' : '')} onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}>
              <div className={'dot ' + (counts.pending ? 'amber' : '')} />
              <div>
                <div className="val">{counts.pending}</div>
                <div className="lbl">Password change pending</div>
              </div>
            </button>
            <button className={'stat-card ai-sum-card' + (statusFilter === 'locked' ? ' staff-sum-on' : '')} onClick={() => setStatusFilter(statusFilter === 'locked' ? 'all' : 'locked')}>
              <div className={'dot ' + (counts.locked ? 'red' : '')} />
              <div>
                <div className="val">{counts.locked}</div>
                <div className="lbl">Locked</div>
              </div>
            </button>
            <button className={'stat-card ai-sum-card' + (statusFilter === 'idle' ? ' staff-sum-on' : '')} onClick={() => setStatusFilter(statusFilter === 'idle' ? 'all' : 'idle')}>
              <div className={'dot ' + (counts.idle ? 'amber' : '')} />
              <div>
                <div className="val">{counts.idle}</div>
                <div className="lbl">
                  <span>No sign-in for</span> <span className="mono">{IDLE_DAYS}</span> <span>days</span>
                </div>
              </div>
            </button>
          </div>

          <div className="card">
            <div className="ai-toolbar">
              <div className="ai-search">
                <Icon name="search" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, username, staff code, phone…" />
              </div>
              <div className="ai-toolbar-right">
                <select className="ai-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="all">All roles</option>
                  {Object.entries(ROLES).map(([k, r]) => (
                    <option key={k} value={k}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <div className="ai-seg">
                  {STATUS_FILTERS.map((f) => (
                    <button key={f.key} className={statusFilter === f.key ? 'active' : ''} onClick={() => setStatusFilter(f.key)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="ai-soft">No accounts match.</p>
            ) : (
              <div className="ai-table-wrap">
                <table className="dt staff-table">
                  <thead>
                    <tr>
                      <th>Staff code</th>
                      <th>Full name</th>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th>Last sign-in</th>
                      <th>Created</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => {
                      const self = a.id === me.id
                      const idle = isIdle(a)
                      return (
                        <tr key={a.id} className={a.active ? '' : 'ai-dim'}>
                          <td className="mono">{a.staffCode || '—'}</td>
                          <td>
                            <b>{a.fullName}</b> {self && <span className="badge ok">You</span>}
                            {hasDefaultName(a) && <div className="ai-small sp-warn">Default name — change to a real person</div>}
                            {a.fullName.trim().toLowerCase() === a.username.toLowerCase() && (
                              <div className="ai-small sp-warn">Name is the same as the username — enter the real full name</div>
                            )}
                            {a.roleKey === 'doctor' && (
                              <div className="ai-small ai-soft">
                                {a.roomName ? <span>{a.roomName}</span> : <span className="sp-warn">No room</span>}
                                {' · '}
                                {a.licenseNo ? (
                                  <>
                                    <span>Licence</span> <span className="mono">{a.licenseNo}</span>
                                  </>
                                ) : (
                                  <span className="sp-warn">No licence no.</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="mono">{a.username}</td>
                          <td>{ROLES[a.roleKey].label}</td>
                          <td className="mono">{a.phone || '—'}</td>
                          <td>
                            <div className="staff-badges">
                              {!a.active ? <span className="badge muted">Disabled</span> : a.locked ? <span className="badge low" title={translate('Unlocks by itself at') + ' ' + fmtDateTime(a.lockedUntil)}>Locked</span> : <span className="badge ok">Active</span>}
                              {a.mustChange && <span className="badge warn">Password change pending</span>}
                              {a.active && !a.locked && a.failedAttempts > 0 && (
                                <span className="ai-small sp-warn">
                                  <span className="mono">
                                    {a.failedAttempts}/{maxFailed()}
                                  </span>{' '}
                                  <span>failed sign-ins</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="ai-small">
                            {a.lastLoginAt ? <span className="mono">{fmtDateTime(a.lastLoginAt)}</span> : <span className="ai-soft">Never signed in</span>}
                            {idle && <div className="sp-warn">Unused</div>}
                          </td>
                          <td className="ai-small">
                            <span className="mono">{fmtDate(a.createdAt)}</span>
                            {a.createdBy && (
                              <div className="ai-soft">
                                <span>by</span> {a.createdBy}
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="staff-actions">
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}>
                                Edit
                              </button>
                              {self ? (
                                <button className="btn btn-ghost btn-sm" onClick={() => setOwnPw(true)}>
                                  Change password
                                </button>
                              ) : (
                                <>
                                  {a.locked && (
                                    <button className="btn btn-primary btn-sm" onClick={() => unlock(a)}>
                                      Unlock
                                    </button>
                                  )}
                                  <button className="btn btn-ghost btn-sm" onClick={() => askReset(a)}>
                                    Reset password
                                  </button>
                                  {a.active && DEMO_MODE && (
                                    <button className="btn btn-ghost btn-sm" onClick={() => askForceSignOut(a)}>
                                      Force sign-out
                                    </button>
                                  )}
                                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(a)}>
                                    {a.active ? 'Disable' : 'Enable'}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tạo / sửa tài khoản */}
      <Modal open={!!form} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={submitForm}>
            <ModalHeader title={editing ? `Edit account — ${editing.username}` : 'New account'} onClose={() => setForm(null)} />
            <div className="modal-body">
              {formErr && <div className="login-err show">{formErr}</div>}
              <div className="form-grid cols-2">
                <div className="field">
                  <label>Full name</label>
                  <input value={form.fullName} autoFocus onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                </div>
                <div className="field">
                  <label>Username</label>
                  <input value={form.username} disabled={!!editing} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                </div>
                <div className="field">
                  <label>Role</label>
                  <select value={form.roleKey} disabled={editing?.id === me.id} onChange={(e) => setForm({ ...form, roleKey: e.target.value })}>
                    {Object.entries(ROLES).map(([k, r]) => (
                      <option key={k} value={k}>
                        {r.label}
                        {k === 'admin' && !editing ? ' (secondary admin)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input value={form.phone} inputMode="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                {editing && (
                  <div className="field">
                    <label>Staff code</label>
                    <input value={form.staffCode} onChange={(e) => setForm({ ...form, staffCode: e.target.value })} />
                  </div>
                )}
                {form.roleKey === 'doctor' && (
                  <>
                    <div className="field">
                      <label>Consultation room</label>
                      <select value={form.roomId ?? ''} onChange={(e) => setForm({ ...form, roomId: e.target.value || null })}>
                        <option value="">— Not assigned —</option>
                        {rooms.map((r) => {
                          // Phòng đã có bác sĩ khác: không chọn được (server trả 409 ROOM_TAKEN)
                          const taken = r.physician && r.physician.id !== form.id
                          return (
                            <option key={r.id} value={r.id} disabled={!!taken}>
                              {r.name}
                              {taken ? ' — ' + r.physician.name : ''}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                    <div className="field">
                      <label>Practising licence no.</label>
                      <input value={form.licenseNo} onChange={(e) => setForm({ ...form, licenseNo: e.target.value })} placeholder="Printed on prescriptions" />
                    </div>
                  </>
                )}
              </div>
              {editing?.id === me.id && <p className="login-note">You cannot change your own role — ask another administrator.</p>}
              {editing && form.roleKey !== editing.roleKey && (
                <p className="login-note sp-warn">
                  <span>Role change:</span> <span>{ROLES[editing.roleKey].label}</span> → <span>{ROLES[form.roleKey].label}</span>.{' '}
                  <span>You will be asked for your password.</span>
                </p>
              )}
              {!editing && <p className="login-note">A temporary password is generated after you create the account — it is shown once so you can send it to the staff member.</p>}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                {editing ? 'Save' : 'Create account'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Xác thực lại bằng mật khẩu admin */}
      <ReauthModal open={!!reauth} title={reauth?.title ?? ''} confirmLabel={reauth?.confirmLabel} danger={reauth?.danger} onClose={() => setReauth(null)} onConfirm={() => reauth.run()}>
        {reauth && <p className="ai-soft">{reauth.message}</p>}
      </ReauthModal>

      {/* Mật khẩu tạm — chỉ hiện 1 lần */}
      {/* Không đóng khi bấm ra ngoài — tránh mất mật khẩu trước khi kịp sao chép. */}
      <Modal open={!!secret} onClose={() => {}}>
        {secret && <SecretPanel secret={secret} onClose={() => setSecret(null)} />}
      </Modal>

      {/* Tự đổi mật khẩu của mình */}
      <ChangePasswordModal open={ownPw} onClose={() => setOwnPw(false)} />

      {/* Xác nhận thường (buộc đăng xuất) */}
      <Modal open={!!confirm} onClose={() => setConfirm(null)}>
        {confirm && (
          <>
            <ModalHeader title={confirm.title} onClose={() => setConfirm(null)} />
            <div className="modal-body">
              <p className="ai-soft">{confirm.message}</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <Button className="btn btn-danger" onClick={confirm.run}>
                {confirm.confirmLabel}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

function SecretPanel({ secret, onClose }) {
  const [copied, setCopied] = useState(false)
  const { account: a, password } = secret
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${a.username}\n${password}`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <>
      <ModalHeader title={secret.reset ? 'New temporary password' : 'Account created'} onClose={onClose} />
      <div className="modal-body">
        <p className="ai-soft">
          <span>Send these sign-in details to</span> <b>{a.fullName}</b> <span>through a private channel. They must change the password at first sign-in.</span>
        </p>
        <div className="staff-secret">
          <div>
            <div className="ai-small ai-soft">Username</div>
            <div className="mono">{a.username}</div>
          </div>
          <div>
            <div className="ai-small ai-soft">Temporary password</div>
            <div className="mono staff-secret-pw">{password}</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
            <Icon name={copied ? 'check' : 'clipboard'} /> <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <p className="login-note sp-warn">This password is shown only once. After you close this window it cannot be displayed again — only reset.</p>
      </div>
      <div className="modal-foot">
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}
