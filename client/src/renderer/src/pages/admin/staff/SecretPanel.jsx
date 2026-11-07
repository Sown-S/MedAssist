import { useState } from 'react'
import { ModalHeader } from '../../../components/Modal'
import Icon from '../../../components/Icon'
import { useToast } from '../../../context/ToastContext'

// Mật khẩu tạm sau khi tạo / đặt lại tài khoản — chỉ hiện một lần.
export default function SecretPanel({ secret, onClose }) {
  const [copied, setCopied] = useState(false)
  const { showToast } = useToast()
  const { account: a, password } = secret
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${a.username}\n${password}`)
      setCopied(true)
    } catch {
      // Máy chặn clipboard: báo để người dùng tự bôi đen sao chép, vì mật khẩu chỉ hiện một lần.
      setCopied(false)
      showToast('Could not copy — select the password and copy it by hand', 'error')
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
