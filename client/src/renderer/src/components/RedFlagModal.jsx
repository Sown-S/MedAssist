import Icon from './Icon'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { recordRedFlag } from '../api/queueStore'
// FR09 — Red-flag Escalation. Cố tình KHÔNG dùng component Modal dùng chung ở trên,
// vì đây là 1 overlay cảnh báo toàn màn hình khác hẳn ý nghĩa với modal nhập liệu thông thường,
// và không được phép đưa bệnh nhân vào hàng đợi khám như nút "Ưu tiên".
// patient = { name, gender, age, signs } đang nhập ở form tiếp đón; onReferred: đã ghi nhận chuyển tuyến.
export default function RedFlagModal({ open, onClose, patient, onReferred }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  if (!open) return null

  function handleRefer() {
    recordRedFlag(patient ?? {}, user, 'referred')
    onClose()
    onReferred?.()
    showToast('Emergency transfer recorded — send the patient to hospital / call 115 now; doctors have been alerted')
  }

  return (
    <div className="redflag-overlay show">
      <div className="redflag-box">
        <div className="ic">
          <Icon name="ban" />
        </div>
        <h3>Emergency warning signs — beyond clinic scope</h3>
        <p>
          The recorded symptoms may indicate an emergency condition, outside the scope of the
          system's advisory triage.
        </p>
        <p className="note">
          Recommendation: refer the patient to a higher-level hospital immediately. This is <b>not</b>{' '}
          the "Priority" queue — the patient will not be added to the clinic's consultation queue.
        </p>
        <div className="redflag-actions">
          <button className="btn" style={{ background: 'var(--warn)', color: '#fff' }} onClick={handleRefer}>
            Emergency — transfer now
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Go back and edit symptoms
          </button>
        </div>
      </div>
    </div>
  )
}
