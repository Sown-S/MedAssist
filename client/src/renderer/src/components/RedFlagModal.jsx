import { useState } from 'react'
import Icon from './Icon'
import DocumentModal from '../pages/doctor/DocumentModal'
// Cảnh báo cờ đỏ toàn màn hình (FR09), cố ý không dùng Modal chung vì khác hẳn modal nhập liệu.
// Lượt đã có (visitId) thì chuyển tuyến lượt đó; chưa có thì tạo lượt cấp cứu và chuyển ngay
// (POST /visits/emergency-referral); patient.ensurePatient() tạo hồ sơ nếu là bệnh nhân mới.
export default function RedFlagModal({ open, onClose, patient, onReferred }) {
  const [referring, setReferring] = useState(false)
  if (!open) return null

  const handleRefer = () => setReferring(true)

  if (referring)
    return (
      <DocumentModal
        subject={patient ?? {}}
        mode="desk"
        target={{ visitId: patient?.visitId, ensurePatient: patient?.ensurePatient, chief: patient?.chief, vitals: patient?.vitals }}
        onDone={() => {
          setReferring(false)
          onClose()
          onReferred?.()
        }}
        onClose={() => setReferring(false)}
      />
    )

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
