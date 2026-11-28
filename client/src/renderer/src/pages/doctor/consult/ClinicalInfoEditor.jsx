import { useState } from 'react'
import Button from '../../../components/Button'
import Icon from '../../../components/Icon'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { updateClinical } from '../../../api/clinicApi'

// Bác sĩ xác nhận / sửa dị ứng và bệnh nền (lễ tân chỉ ghi lời khai); lưu vào hồ sơ để đơn đang kê và các lần sau dùng thông tin mới.
// Chỉ gửi allergy_notes, medical_history (bác sĩ không sửa thông tin hành chính); lưu xong đầu phiếu và khung nhắc kê đơn đổi ngay.
export function ClinicalInfoEditor({ visit, onVisitSaved }) {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ allergies: '', history: '' })
  function start() {
    setF({ allergies: visit.allergies ?? '', history: visit.history ?? '' })
    setOpen(true)
  }
  async function save() {
    try {
      const p = await updateClinical(visit.patientId, f)
      onVisitSaved?.({ allergies: p.allergies, history: p.history })
      setOpen(false)
      showToast('Patient record updated')
    } catch (e) {
      showToast(translate(e.message), 'error')
      return false
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
      <div className="fg">
        <div className="field">
          <label>Drug allergies</label>
          <input className="input" type="text" autoFocus value={f.allergies} onChange={(e) => setF({ ...f, allergies: e.target.value })} placeholder="Penicillin…" />
        </div>
        <div className="field">
          <label>Medical history (chronic conditions)</label>
          <input className="input" type="text" value={f.history} onChange={(e) => setF({ ...f, history: e.target.value })} placeholder="Hypertension, diabetes…" />
        </div>
      </div>
      <div className="d-flex gap-8 justify-end">
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <Button className="btn btn-primary btn-sm" onClick={save}>
          <Icon name="check" /> Save to patient record
        </Button>
      </div>
    </div>
  )
}
