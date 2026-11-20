import { useState } from 'react'
import Icon from './Icon'
import { translate } from '../i18n'
import Modal, { ModalHeader } from './Modal'
import DocumentModal from '../pages/doctor/DocumentModal'
// Cảnh báo cờ đỏ (FR09): hộp xác nhận nhỏ kiểu "confirm" của bản mẫu, nút đỏ chuyển viện ngay.
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
    <Modal open onClose={onClose} size="sm">
      <ModalHeader title={translate('Emergency warning signs — beyond clinic scope')} onClose={onClose} />
      <div className="modal-b">
        <div className="confirm">
          <div className="ico d">
            <Icon name="siren" />
          </div>
          <p>
            <b>{translate("The recorded symptoms may indicate an emergency condition, outside the scope of the system's advisory triage.")}</b>
            <br />
            {translate('Recommendation: refer the patient to a higher-level hospital immediately. This is not the Priority queue — the patient is not added to the clinic consultation queue.')}
          </p>
        </div>
      </div>
      <div className="modal-f">
        <button className="btn btn-outline" onClick={onClose}>
          {translate('Go back and edit symptoms')}
        </button>
        <button className="btn btn-danger" onClick={handleRefer}>
          <Icon name="ambulance" />
          {translate('Emergency — transfer now')}
        </button>
      </div>
    </Modal>
  )
}
