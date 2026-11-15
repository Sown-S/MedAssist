import { VITAL_KEYS, vitalDef } from '../api/vitals'
import { translate } from '../i18n'

// errorKeys: các khoá đang lỗi (tô đỏ). requireWeight: trẻ < 12 tuổi bắt buộc cân nặng (cần cho liều thuốc).
const ORDER = ['heart_rate_bpm', 'systolic_bp_mmhg', 'diastolic_bp_mmhg', 'temperature_c', 'spo2_pct', 'respiratory_rate_bpm', 'weight_kg', 'height_cm']

export default function VitalsFields({ value, onChange, errorKeys = new Set(), requireWeight = false }) {
  return (
    <div className="fg3">
      {ORDER.map((k) => {
        const d = vitalDef(k)
        const req = k === 'weight_kg' && requireWeight
        const bad = errorKeys.has(k)
        return (
          <div className={'field' + (bad ? ' invalid' : '')} key={k}>
            <label>
              {translate(d.label)} ({d.unit})
              {req && <span className="req">*</span>}
            </label>
            <input
              type="text"
              inputMode={d.decimals ? 'decimal' : 'numeric'}
              className="input"
              placeholder={req ? translate('needed for children’s doses') : d.placeholder}
              value={value[k] ?? ''}
              onChange={(e) => onChange(k, e.target.value)}
            />
          </div>
        )
      })}
    </div>
  )
}

export { VITAL_KEYS }
