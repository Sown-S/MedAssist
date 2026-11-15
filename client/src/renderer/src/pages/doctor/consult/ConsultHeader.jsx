import Icon from '../../../components/Icon'
import PatientAlerts from '../../../components/PatientAlerts'
import { translate } from '../../../i18n'
import { dmy, hhmm } from '../../reception/shared'
import { ClinicalInfoEditor } from './ClinicalInfoEditor'
import { num, isChild } from './rxDraft'

const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0].toUpperCase())
    .join('')

const STATUS_CHIP = { waiting: 'WAITING', in_exam: 'IN CONSULTATION', labs: 'WAITING FOR LABS' }

// Đầu phiếu khám: tên, dải sinh hiệu + lần khám trước, ghi chú trả đơn, cờ đỏ / sàn ưu tiên, dị ứng, thông tin lâm sàng.
export default function ConsultHeader({ visit, vit, prev, alerts }) {
  return (
    <>
      <div className="consult-head">
        <span className="ava" aria-hidden="true">
          {initials(visit.name)}
        </span>
        <div className="ch-id">
          <h2>
            <span className="p-ticket" style={{ marginRight: 8 }}>
              {String(visit.ticket).padStart(3, '0')}
            </span>
            {visit.name}
            {visit.triage === 'emergency' ? <span className="badge b-danger">{translate('Emergency')}</span> : visit.priority ? <span className="badge b-warning">{translate('Priority')}</span> : null}
          </h2>
          <div className="sub">
            {translate(visit.gender)}
            {visit.age !== '' ? ' · ' + visit.age + ' ' + translate('yrs') : ''} · <span className="num">{visit.patientCode ?? visit.patientId}</span> · <span className="num">{visit.phone}</span>
          </div>
        </div>
        {STATUS_CHIP[visit.status] && <span className="status-chip">{STATUS_CHIP[visit.status]}</span>}
      </div>

      <div className="consult-strip">
        <span>
          <small>Pulse</small>
          <b className="num">{vit.heart_rate_bpm || '—'}</b>
        </span>
        <span>
          <small>BP</small>
          <b className="num">{vit.systolic_bp_mmhg ? vit.systolic_bp_mmhg + '/' + (vit.diastolic_bp_mmhg || '—') : '—'}</b>
        </span>
        <span className={num(vit.temperature_c) >= 38.5 ? 'hot' : ''}>
          <small>Temp</small>
          <b className="num">{vit.temperature_c ? vit.temperature_c + '°C' : '—'}</b>
        </span>
        <span className={vit.spo2_pct && num(vit.spo2_pct) < 94 ? 'hot' : ''}>
          <small>SpO2</small>
          <b className="num">{vit.spo2_pct ? vit.spo2_pct + '%' : '—'}</b>
        </span>
        <span className={isChild(visit) && !(num(vit.weight_kg) > 0) ? 'need' : ''}>
          <small>Body weight</small>
          <b className="num">{vit.weight_kg ? vit.weight_kg + ' kg' : isChild(visit) ? translate('required') : '—'}</b>
        </span>
        <span className="wide">
          <small>Last visit</small>
          <b>{prev ? dmy(prev.rxAt ?? prev.statusAt) + ' · ' + (prev.diagnosis || '—') : translate('First visit')}</b>
        </span>
      </div>

      {visit.returnNote && (
        <div className="warn-banner show caution" style={{ margin: '10px 0' }}>
          <div className="icon">
            <Icon name="alert" />
          </div>
          <div className="txt">
            <b>
              {translate('Sent back by')} {visit.returnNote.by} · {hhmm(visit.returnNote.at)} — {translate('not enough stock, please change these drugs')}
            </b>
            {visit.returnNote.text}
          </div>
        </div>
      )}
      {alerts.map((f) => (
        <div key={f.rule_key} className="warn-banner show danger" style={{ margin: '10px 0' }}>
          <div className="icon">
            <Icon name="ban" />
          </div>
          <div className="txt">
            <b>{translate(f.rule_type === 'RED_FLAG' ? 'Red flag' : 'Priority')}</b>
            {f.reason_text}
          </div>
        </div>
      ))}
      <PatientAlerts p={visit} />
      <ClinicalInfoEditor visit={visit} />
    </>
  )
}
