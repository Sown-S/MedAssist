import VitalsFields from '../../../components/VitalsFields'
import { translate } from '../../../i18n'
import { vitalsText } from '../../../api/vitals'
import ServerHistory from '../ServerHistory'
import { isChild } from './rxDraft'

// Tab "Sinh hiệu" của phiếu khám: đo lại trong phòng; trẻ dưới 12 tuổi bắt buộc cân nặng để chốt đơn.
export function VitalsTab({ visit, vitals, onChange, tried, needWeight, vitalErr }) {
  return (
    <div className="ipanel active">
      <div className="section-label">Vitals for this visit</div>
      <p className="ai-soft" style={{ fontSize: 12.5, marginTop: 0 }}>
        <span>Recorded at check-in:</span> <span className="mono">{vitalsText(visit.vitals)}</span>
      </p>
      <VitalsFields
        value={vitals}
        onChange={onChange}
        errorKeys={tried ? new Set([...vitalErr.map((e) => e.key), ...(needWeight ? ['weight_kg'] : [])]) : new Set()}
        requireWeight={isChild(visit)}
      />
      {vitalErr.length > 0 && <p className="ai-soft" style={{ color: '#FCA5A5', fontSize: 12.5 }}>{vitalErr.map((e) => translate(e.msg)).join(' · ')}</p>}
      {isChild(visit) && <p className="ai-soft" style={{ fontSize: 12.5 }}>Children under 12: weight is required to finalize a prescription — doses are calculated per kg.</p>}
    </div>
  )
}

// Tab "Tiền sử": bệnh nền, dị ứng và lịch sử khám từ server (không tính lượt đang khám).
export function HistoryTab({ visit }) {
  return (
    <div className="ipanel active">
      <div className="section-label">Underlying conditions</div>
      <div className="symptom-box">{visit.history ? translate(visit.history) : translate('No chronic conditions on record.')}</div>
      <div className="section-label">Drug allergies</div>
      <div className="symptom-box">{visit.allergies ? translate(visit.allergies) : translate('No recorded drug allergies.')}</div>
      <ServerHistory patientId={visit.patientId} excludeVisitId={visit.id} />
    </div>
  )
}
