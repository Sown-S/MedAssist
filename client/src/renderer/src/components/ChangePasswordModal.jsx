import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import { useAuth } from '../context/AuthContext'
import { changePassword } from '../api/authApi'
import { usePasswordMinLength } from '../api/accountStore'

// Đổi xong server thu hồi mọi token → về màn đăng nhập.
export default function ChangePasswordModal({ open, onClose }) {
  const { user: me, signOutAfterPasswordChange } = useAuth()
  const [form, setForm] = useState({ old: '', np: '', np2: '', err: '' })
  const [busy, setBusy] = useState(false)
  const minLength = usePasswordMinLength()

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
    <Modal open={open} onClose={onClose} size="sm">
      <form onSubmit={submit}>
        <ModalHeader title="Change your password" onClose={onClose} />
        <div className="modal-b">
          {form.err && (
            <div className="banner d mb-12">
              {form.err}
            </div>
          )}
          <div className="fg">
            <div className="field full">
              <label>Current password</label>
              <input className="input" type="password" autoFocus autoComplete="current-password" value={form.old} onChange={(e) => setForm({ ...form, old: e.target.value })} />
            </div>
            <div className="field full">
              <label>{`New password (at least ${minLength} characters)`}</label>
              <input className="input" type="password" autoComplete="new-password" value={form.np} onChange={(e) => setForm({ ...form, np: e.target.value })} />
            </div>
            <div className="field full">
              <label>Confirm new password</label>
              <input className="input" type="password" autoComplete="new-password" value={form.np2} onChange={(e) => setForm({ ...form, np2: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button data-shortcut="save" type="submit" className="btn btn-primary" disabled={busy || !form.old || !form.np}>
            Change password
          </button>
        </div>
      </form>
    </Modal>
  )
}
