import { useEffect, useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import ReauthModal from '../../components/ReauthModal'
import ChangePasswordModal from '../../components/ChangePasswordModal'
import Icon from '../../components/Icon'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { ROLES, hasDefaultName, listAccounts, createAccount, updateAccount, setActive, resetPassword, unlockAccount } from '../../api/accountStore'
import { listRooms, examRooms } from '../../api/roomStore'
import { EMPTY, FIELD_LABELS, isIdle, matchStatus } from './staff/staffShared'
import StaffSummary from './staff/StaffSummary'
import StaffTable from './staff/StaffTable'
import AccountFormModal from './staff/AccountFormModal'
import SecretPanel from './staff/SecretPanel'

export default function StaffPage() {
  const { showToast } = useToast()
  const { user: me, refreshUser } = useAuth()
  // Mỗi phòng khám chỉ một bác sĩ đang hoạt động.
  const [rooms, setRooms] = useState([])

  const [accounts, setAccounts] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const [form, setForm] = useState(null) // null = đóng; có id = đang sửa
  const [formErr, setFormErr] = useState('')
  const [reauth, setReauth] = useState(null)
  const [secret, setSecret] = useState(null) // mật khẩu tạm, chỉ hiện một lần
  const [ownPw, setOwnPw] = useState(false)

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
    const res = await createAccount(form)
    if (!res.ok) return setFormErr(res.error)
    const a = res.account
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
    if (a.id === me.id) refreshUser(a)
    showToast(fields.length || before.roleKey !== a.roleKey ? 'Account updated' : 'No changes')
    setForm(null)
    refresh()
  }

  function askReset(a) {
    setReauth({
      title: `Reset password — ${a.username}`,
      message: 'A new temporary password will be generated and shown once. The account is unlocked, its open sessions end, and the staff member must change the password at next sign-in.',
      confirmLabel: 'Reset',
      danger: true,
      run: async () => {
        setReauth(null)
        const res = await resetPassword(a.id)
        if (!res.ok) return showToast(res.error, 'error')
        setSecret({ account: a, password: res.password, reset: true })
        refresh()
      }
    })
  }
  async function unlock(a) {
    const res = await unlockAccount(a.id)
    if (!res.ok) return showToast(res.error, 'error')
    showToast('Account unlocked')
    refresh()
  }
  async function toggle(a) {
    const res = await setActive(a.id, !a.active)
    if (!res.ok) return showToast(res.error, 'error')
    showToast(a.active ? 'Account disabled' : 'Account re-enabled')
    refresh()
  }

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

          <StaffSummary counts={counts} roleFilter={roleFilter} setRoleFilter={setRoleFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />

          <StaffTable
            rows={rows}
            me={me}
            q={q}
            setQ={setQ}
            roleFilter={roleFilter}
            setRoleFilter={setRoleFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onEdit={openEdit}
            onOwnPw={() => setOwnPw(true)}
            onUnlock={unlock}
            onReset={askReset}
            onToggle={toggle}
          />
        </>
      )}

      <AccountFormModal form={form} setForm={setForm} editing={editing} me={me} rooms={rooms} formErr={formErr} onSubmit={submitForm} />

      <ReauthModal open={!!reauth} title={reauth?.title ?? ''} confirmLabel={reauth?.confirmLabel} danger={reauth?.danger} onClose={() => setReauth(null)} onConfirm={() => reauth.run()}>
        {reauth && <p className="ai-soft">{reauth.message}</p>}
      </ReauthModal>

      {/* Không đóng khi bấm ra ngoài — tránh mất mật khẩu trước khi kịp sao chép. */}
      <Modal open={!!secret} onClose={() => {}}>
        {secret && <SecretPanel secret={secret} onClose={() => setSecret(null)} />}
      </Modal>

      <ChangePasswordModal open={ownPw} onClose={() => setOwnPw(false)} />

    </div>
  )
}
