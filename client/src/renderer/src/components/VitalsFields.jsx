import { VITAL_KEYS, vitalDef } from '../api/vitals'
import { translate } from '../i18n'

// 8 ô sinh hiệu theo đúng khoá của backend (api/vitals.js). Huyết áp tách 2 ô tâm thu / tâm trương.
// value: { khoá: chuỗi đang gõ }, onChange(khoá, chuỗi), errorKeys: Set các khoá đang lỗi (tô đỏ — như details[].field của server).
// requireWeight: trẻ < 12 tuổi → cân nặng bắt buộc (cần cho liều thuốc).
const ORDER = ['heart_rate_bpm', 'systolic_bp_mmhg', 'diastolic_bp_mmhg', 'temperature_c', 'spo2_pct', 'respiratory_rate_bpm', 'weight_kg', 'height_cm']

export default function VitalsFields({ value, onChange, errorKeys = new Set(), requireWeight = false, highlight = new Set() }) {
  return (
    <div className="vitals-grid">
      {ORDER.map((k) => {
        const d = vitalDef(k)
        const req = k === 'weight_kg' && requireWeight
        const cls = (errorKeys.has(k) ? 'field-error' : '') + (highlight.has(k) ? ' field-ask' : '')
        return (
          <div className="field" key={k}>
            <label>
              {translate(d.label)} <span className="ai-soft">({d.unit})</span>
              {req && <span className="req"> *</span>}
            </label>
            <input
              type="text"
              inputMode={d.decimals ? 'decimal' : 'numeric'}
              className={cls.trim()}
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
