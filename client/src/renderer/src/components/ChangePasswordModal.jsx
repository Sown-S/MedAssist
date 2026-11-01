import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import { useAuth } from '../context/AuthContext'
import { changePassword } from '../api/authApi'
import { getSettings } from '../api/settingsStore'

// Đổi xong server thu hồi mọi token → về màn đăng nhập.
export default function ChangePasswordModal({ open, onClose }) {
  const { user: me, signOutAfterPasswordChange } = useAuth()
  const [form, setForm] = useState({ old: '', np: '', np2: '', err: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setForm({ old: '', np: '', np2: '', err: '' })
  }, [open])

  async function submit(e) {
    e.preventDefault()
    if (form.np !== form.np2) return setForm({ ...form, err: 'The two new passwords do not match.' })
    setBusy(true)
    const res = await changePassword(me, form.old, form.np)
    setBusy(false)
    if (!res.ok) return setForm({ ...form, err: res.error })
    signOutAfterPasswordChange()
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={submit}>
        <ModalHeader title="Change your password" onClose={onClose} />
        <div className="modal-body">
          {form.err && <div className="login-err show">{form.err}</div>}
          <div className="login-field">
            <label>Current password</label>
            <input type="password" autoFocus autoComplete="current-password" value={form.old} onChange={(e) => setForm({ ...form, old: e.target.value })} />
          </div>
          <div className="login-field">
            <label>{`New password (at least ${getSettings().security.minLength} characters)`}</label>
            <input type="password" autoComplete="new-password" value={form.np} onChange={(e) => setForm({ ...form, np: e.target.value })} />
          </div>
          <div className="login-field">
            <label>Confirm new password</label>
            <input type="password" autoComplete="new-password" value={form.np2} onChange={(e) => setForm({ ...form, np2: e.target.value })} />
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !form.old || !form.np}>
            Change password
          </button>
        </div>
      </form>
    </Modal>
  )
}
