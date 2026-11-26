import VitalsFields from '../../../components/VitalsFields'
import Button from '../../../components/Button'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { vitalsText } from '../../../api/vitals'
import ServerHistory from '../ServerHistory'
import { isChild } from './rxDraft'

// Tab "Sinh hiệu" của phiếu khám: đo lại trong phòng; trẻ dưới 12 tuổi bắt buộc cân nặng để chốt đơn.
// Lưu sinh hiệu → máy chủ tính lại mức ưu tiên, cờ đỏ ngay (không chờ chốt đơn).
export function VitalsTab({ visit, vitals, onChange, tried, needWeight, vitalErr, dirty, onSave }) {
  return (
    <div className="ipanel active">
      <div className="sec-t">Vitals for this visit</div>
      <p className="muted small mt-0">
        <span>Saved on the server:</span> <span className="num">{vitalsText(visit.vitals)}</span>
      </p>
      <VitalsFields
        value={vitals}
        onChange={onChange}
        errorKeys={tried ? new Set([...vitalErr.map((e) => e.key), ...(needWeight ? ['weight_kg'] : [])]) : new Set()}
        requireWeight={isChild(visit)}
      />
      {vitalErr.length > 0 && <p className="small text-danger">{vitalErr.map((e) => translate(e.msg)).join(' · ')}</p>}
      {isChild(visit) && <p className="muted small">Children under 12: weight is required to finalize a prescription — doses are calculated per kg.</p>}
      <div className="d-flex justify-end gap-8 mt-12">
        {dirty && <span className="muted small" style={{ alignSelf: 'center' }}>Not saved yet — the priority is recalculated when you save.</span>}
        <Button className="btn btn-primary btn-sm" disabled={!dirty} onClick={onSave}>
          <Icon name="save" /> <span>Save vitals</span>
        </Button>
      </div>
    </div>
  )
}

// Tab "Tiền sử": bệnh nền, dị ứng và lịch sử khám từ server (không tính lượt đang khám).
export function HistoryTab({ visit }) {
  return (
    <div className="ipanel active">
      <div className="sec-t">Underlying conditions</div>
      <div className="symptom-box">{visit.history ? translate(visit.history) : translate('No chronic conditions on record.')}</div>
      <div className="sec-t">Drug allergies</div>
      <div className="symptom-box">{visit.allergies ? translate(visit.allergies) : translate('No recorded drug allergies.')}</div>
      <ServerHistory patientId={visit.patientId} excludeVisitId={visit.id} />
    </div>
  )
}
