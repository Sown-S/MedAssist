import { VITAL_KEYS, vitalDef } from '../api/vitals'
import { translate } from '../i18n'

// errorKeys: các khoá đang lỗi (tô đỏ). requireWeight: trẻ < 12 tuổi bắt buộc cân nặng (cần cho liều thuốc).
const ORDER = ['heart_rate_bpm', 'systolic_bp_mmhg', 'diastolic_bp_mmhg', 'temperature_c', 'spo2_pct', 'respiratory_rate_bpm', 'weight_kg', 'height_cm']

// Nhãn ngắn một dòng (tên đầy đủ hiện khi rê chuột); đơn vị nằm trong ô, bên phải — các ô thẳng hàng nhau.
const SHORT = { systolic_bp_mmhg: 'BP systolic', diastolic_bp_mmhg: 'BP diastolic' }

export default function VitalsFields({ value, onChange, errorKeys = new Set(), requireWeight = false }) {
  return (
    <div className="fg3 vitals-g">
      {ORDER.map((k) => {
        const d = vitalDef(k)
        const req = k === 'weight_kg' && requireWeight
        const bad = errorKeys.has(k)
        return (
          <div className={'field' + (bad ? ' invalid' : '')} key={k}>
            <label htmlFor={'v-' + k} title={translate(d.label) + ' (' + d.unit + ')'}>
              {translate(SHORT[k] ?? d.label)}
              {req && <span className="req">*</span>}
            </label>
            <div className="unit-in">
              <input
                id={'v-' + k}
                type="text"
                inputMode={d.decimals ? 'decimal' : 'numeric'}
                className="input"
                placeholder={req ? translate('needed for children’s doses') : d.placeholder}
                value={value[k] ?? ''}
                onChange={(e) => onChange(k, e.target.value)}
              />
              <span className="unit">{d.unit}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export { VITAL_KEYS }
