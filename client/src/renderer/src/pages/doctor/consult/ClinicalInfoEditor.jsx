import { useState } from 'react'
import Icon from '../../../components/Icon'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { updateClinical } from '../../../api/clinicApi'

// Bác sĩ xác nhận / sửa dị ứng và bệnh nền (lễ tân chỉ ghi lời khai); lưu vào hồ sơ để đơn đang kê và các lần sau dùng thông tin mới.
export function ClinicalInfoEditor({ visit }) {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ allergies: '', history: '' })
  function start() {
    setF({ allergies: visit.allergies ?? '', history: visit.history ?? '' })
    setOpen(true)
  }
  async function save() {
    try {
      await updateClinical(visit.patientId, f)
      setOpen(false)
      showToast('Patient record updated')
    } catch (e) {
      showToast(translate(e.message))
    }
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
