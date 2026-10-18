import { useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import Button from './Button'
import { useAuth } from '../context/AuthContext'
import { verifyPassword } from '../api/accountStore'

// Thao tác nhạy cảm (tạo quản trị viên, đặt lại mật khẩu, đổi vai trò, đổi quyền) phải nhập lại mật khẩu
// của chính người đang đăng nhập — tránh trường hợp máy để quên chưa khoá màn hình.
// Bản thật: server cấp "token xác thực lại" ngắn hạn và endpoint nhạy cảm đòi token đó.
export default function ReauthModal({ open, title, confirmLabel = 'Confirm', danger, onConfirm, onClose, children }) {
  const { user } = useAuth()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function close() {
    setPw('')
    setErr('')
    onClose()
  }
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    const ok = await verifyPassword(user.id, pw)
    setBusy(false)
    if (!ok) return setErr('Incorrect password.')
    setPw('')
    setErr('')
    onConfirm()
  }

  return (
    <Modal open={open} onClose={close}>
      <form onSubmit={submit}>
        <ModalHeader title={title} onClose={close} />
        <div className="modal-body">
          {children}
          {err && <div className="login-err show">{err}</div>}
          <div className="login-field" style={{ marginTop: 12 }}>
            <label>Your password (to confirm)</label>
            <input type="password" value={pw} autoFocus autoComplete="current-password" onChange={(e) => setPw(e.target.value)} />
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <Button type="submit" className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} disabled={!pw} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
