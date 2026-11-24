import Icon from '../../../components/Icon'
import PatientAlerts from '../../../components/PatientAlerts'
import { translate } from '../../../i18n'
import { ClinicalInfoEditor } from './ClinicalInfoEditor'
import { num, isChild } from './rxDraft'
import { dmy, hhmm } from '../../../utils/format'
import { askPregnancy, PREGNANCY_LABEL } from '../../../api/patient'

const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0].toUpperCase())
    .join('')

const STATUS_CHIP = { waiting: 'WAITING', in_exam: 'IN CONSULTATION', labs: 'WAITING FOR LABS' }

// Đầu phiếu khám (thẻ .ch của bản mẫu): tên, dải sinh hiệu, lần khám trước, ghi chú trả đơn, cờ đỏ / sàn ưu tiên, dị ứng, thông tin lâm sàng.
export default function ConsultHeader({ visit, vit, prev, alerts }) {
  const strip = [
    ['Pulse', vit.heart_rate_bpm || '—', num(vit.heart_rate_bpm) > 100],
    ['BP', vit.systolic_bp_mmhg ? vit.systolic_bp_mmhg + '/' + (vit.diastolic_bp_mmhg || '—') : '—'],
    ['Temp', vit.temperature_c ? vit.temperature_c + '°' : '—', num(vit.temperature_c) >= 38.5],
    ['SpO2', vit.spo2_pct ? vit.spo2_pct + '%' : '—', vit.spo2_pct && num(vit.spo2_pct) < 94],
    ['Body weight', vit.weight_kg ? vit.weight_kg + ' kg' : isChild(visit) ? translate('required') : '—', isChild(visit) && !(num(vit.weight_kg) > 0)]
  ]
  return (
    <div className="card ch">
      <div className="ch-top">
        <div className="ava" aria-hidden="true">
          {initials(visit.name)}
        </div>
        <div className="minw-0">
          <h2>
            {visit.name}
            {visit.triage === 'emergency' ? <span className="badge b-danger">{translate('Emergency')}</span> : visit.priority ? <span className="badge b-warning">{translate('Priority')}</span> : null}
            {STATUS_CHIP[visit.status] && <span className="plain">{translate(STATUS_CHIP[visit.status])}</span>}
          </h2>
          <div className="meta">
            <span className="num">
              {String(visit.ticket).padStart(3, '0')} · {visit.patientCode ?? visit.patientId}
            </span>
            <span>
              {visit.age !== '' ? visit.age + ' ' + translate('yrs') + ' · ' : ''}
              {translate(visit.gender)}
            </span>
            {askPregnancy(visit.gender, visit.age) &&
              (visit.pregnancy === 'yes' ? <span className="badge b-warning">{translate(PREGNANCY_LABEL.yes)}</span> : <span className="muted">{translate(PREGNANCY_LABEL[visit.pregnancy ?? ''])}</span>)}
            {visit.phone && <span className="num">{visit.phone}</span>}
          </div>
        </div>
        <div className="last">
          {translate('Last visit')}
          <br />
          <b className="text-ink">{prev ? dmy(prev.rxAt ?? prev.statusAt) + ' · ' + (prev.diagnosis || '—') : translate('First visit')}</b>
        </div>
      </div>

      <div className="vstrip">
        {strip.map(([l, v, bad]) => (
          <div key={l} className={'v' + (bad ? ' bad' : '')}>
            <span>{translate(l)}</span>
            <b className="num">{v}</b>
          </div>
        ))}
      </div>

      {visit.returnNote && (
        <div className="banner w">
          <Icon name="triangle-alert" />
          <div className="txt">
            <b>
              {translate('Sent back by')} {visit.returnNote.by} · {hhmm(visit.returnNote.at)} — {translate('not enough stock, please change these drugs')}
            </b>
            {visit.returnNote.text}
          </div>
        </div>
      )}
      {alerts.map((f) => (
        <div key={f.rule_key} className="banner d">
          <Icon name="siren" />
          <div className="txt">
            <b>{translate(f.rule_type === 'RED_FLAG' ? 'Red flag' : 'Priority')}</b>
            {f.reason_text}
          </div>
        </div>
      ))}
      <PatientAlerts p={visit} />
      <ClinicalInfoEditor visit={visit} />
    </div>
  )
}
