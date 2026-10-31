import { useState } from 'react'
import Icon from '../../../components/Icon'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { updateVisitClinical } from '../../../api/queueStore'

// Bác sĩ xác nhận / sửa dị ứng thuốc và bệnh nền (lễ tân chỉ ghi lời khai lúc tiếp đón).
// Lưu vào hồ sơ bệnh nhân → kiểm tra tương tác của đơn đang kê và các lần khám sau đều dùng thông tin mới.
export function ClinicalInfoEditor({ visit, user }) {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ allergies: '', history: '' })
  function start() {
    setF({ allergies: visit.allergies ?? '', history: visit.history ?? '' })
    setOpen(true)
  }
  function save() {
    const r = updateVisitClinical(visit.id, f, user)
    if (!r.ok) return showToast(translate(r.error))
    setOpen(false)
    showToast('Patient record updated — prescription checks now use the new information')
  }
  if (!open)
    return (
      <button className="btn btn-ghost btn-sm clin-edit-btn" onClick={start}>
        <Icon name="pencil" /> Update allergies / chronic conditions
      </button>
    )
  return (
    <div className="clin-edit">
      <div className="form-grid cols-2">
        <div className="field">
          <label>Drug allergies</label>
          <input type="text" autoFocus value={f.allergies} onChange={(e) => setF({ ...f, allergies: e.target.value })} placeholder="Penicillin…" />
        </div>
        <div className="field">
          <label>Medical history (chronic conditions)</label>
          <input type="text" value={f.history} onChange={(e) => setF({ ...f, history: e.target.value })} placeholder="Hypertension, diabetes…" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn btn-primary btn-sm" onClick={save}>
          <Icon name="check" /> Save to patient record
        </button>
      </div>
    </div>
  )
}
