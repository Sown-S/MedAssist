import { describe, it, expect } from 'vitest'
import * as vitals from '../src/renderer/src/api/vitals.js'

describe('Sinh hiệu lúc tiếp đón', () => {
  it('đọc số kiểu Việt Nam (dấu phẩy), bỏ đơn vị, ô trống thì không gửi', () => {
    expect(vitals.vitalsFromForm({ temperature_c: '38,56', weight_kg: '60 kg', heart_rate_bpm: '', spo2_pct: '97%' })).toEqual({ temperature_c: 38.6, weight_kg: 60, spo2_pct: 97 })
  })

  it('ngoài khoảng nhập (gõ nhầm) → lỗi; bất thường nhưng có thể đúng → chỉ cảnh báo', () => {
    const r = vitals.checkVitals({ temperature_c: '47', spo2_pct: '75' })
    expect(r.errors.map((e) => e.key)).toEqual(['temperature_c'])
    expect(r.warnings).toHaveLength(0)
    expect(vitals.checkVitals({ temperature_c: '42.5' }).warnings).toHaveLength(1)
  })

  it('mạch phải là số nguyên; chữ thì báo nhập số', () => {
    expect(vitals.checkVitals({ heart_rate_bpm: '80.5' }).errors).toHaveLength(1)
    expect(vitals.checkVitals({ heart_rate_bpm: 'tám mươi' }).errors[0].msg).toMatch(/enter a number/)
  })

  it('huyết áp: phải nhập đủ tâm thu + tâm trương, tâm trương thấp hơn tâm thu', () => {
    expect(vitals.checkVitals({ systolic_bp_mmhg: '120' }).errors).toHaveLength(1)
    expect(vitals.checkVitals({ systolic_bp_mmhg: '80', diastolic_bp_mmhg: '120' }).errors[0].key).toBe('diastolic_bp_mmhg')
    expect(vitals.checkVitals({ systolic_bp_mmhg: '120', diastolic_bp_mmhg: '80' }).errors).toEqual([])
  })

  it('dữ liệu cũ "80 · 120/80" đọc ra đúng 8 khoá chuẩn và hiển thị gọn', () => {
    const v = vitals.normalizeVitals({ pulseBp: '80 · 120/80', temp: '37.5°C' })
    expect(v).toEqual({ heart_rate_bpm: 80, systolic_bp_mmhg: 120, diastolic_bp_mmhg: 80, temperature_c: 37.5 })
    expect(vitals.vitalsText(v)).toBe('HR 80 · BP 120/80 · 37.5°C')
    expect(vitals.vitalsText(null)).toBe('—')
  })
})
