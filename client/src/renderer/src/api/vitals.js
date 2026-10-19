// SINH HIỆU — đúng 8 khoá chuẩn của backend (fn_vital_sign_keys() / server/app/validation/schemas/vital_signs.schema.json).
// Gửi lên server đúng các khoá này, đơn vị hệ mét, dạng SỐ; ô không đo thì BỎ (không gửi 0 / chuỗi rỗng).
// hard = khoảng nhập (ngoài khoảng = gõ nhầm → chặn lưu, server trả VALIDATION_ERROR);
// soft = cảnh báo mềm UNUSUAL_VALUE (vẫn lưu được, hỏi lại). Không phải ngưỡng lâm sàng — ngưỡng lâm sàng nằm trong luật cờ đỏ.
export const VITAL_KEYS = [
  { key: 'temperature_c', label: 'Temperature', short: 'Temp', unit: '°C', decimals: 1, hard: [30, 45], soft: [34, 42], placeholder: '37.0' },
  { key: 'heart_rate_bpm', label: 'Heart rate', short: 'HR', unit: 'bpm', decimals: 0, hard: [20, 250], placeholder: '80' },
  { key: 'respiratory_rate_bpm', label: 'Respiratory rate', short: 'RR', unit: '/min', decimals: 0, hard: [4, 80], placeholder: '18' },
  { key: 'systolic_bp_mmhg', label: 'Systolic BP', short: 'SBP', unit: 'mmHg', decimals: 0, hard: [50, 260], soft: [70, 220], placeholder: '120' },
  { key: 'diastolic_bp_mmhg', label: 'Diastolic BP', short: 'DBP', unit: 'mmHg', decimals: 0, hard: [20, 160], soft: [0, 130], placeholder: '80' },
  { key: 'spo2_pct', label: 'SpO2', short: 'SpO2', unit: '%', decimals: 0, hard: [50, 100], soft: [70, 100], placeholder: '98' },
  { key: 'weight_kg', label: 'Weight', short: 'Wt', unit: 'kg', decimals: 1, hard: [0.5, 300], placeholder: '60' },
  { key: 'height_cm', label: 'Height', short: 'Ht', unit: 'cm', decimals: 1, hard: [30, 250], placeholder: '165' }
]
export const vitalDef = (k) => VITAL_KEYS.find((x) => x.key === k)

const toNum = (x) => {
  if (x === null || x === undefined) return null
  const s = String(x).replace(/°C|%|kg|cm/gi, '').replace(',', '.').trim()
  if (!s || s === '—') return null
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

// Form (chuỗi người dùng gõ) → { khoá: số } — chỉ giữ ô có giá trị.
export function vitalsFromForm(form) {
  const out = {}
  for (const d of VITAL_KEYS) {
    const v = toNum(form[d.key])
    if (v !== null) out[d.key] = d.decimals ? Math.round(v * 10) / 10 : Math.round(v)
  }
  return out
}
// { khoá: số } → giá trị cho các ô nhập (chuỗi).
export const vitalsToForm = (v) => Object.fromEntries(VITAL_KEYS.map((d) => [d.key, v?.[d.key] ?? '']))

// Đọc cả dữ liệu cũ của bản demo ({ pulseBp: '80 · 120/80', temp: '37.5°C', spo2, weight, rr, height }) → 8 khoá chuẩn.
export function normalizeVitals(v) {
  if (!v) return {}
  if (VITAL_KEYS.some((d) => d.key in v)) return vitalsFromForm(v)
  const [pulse, bp] = String(v.pulseBp ?? '').split('·').map((s) => s.trim())
  const [sys, dia] = String(bp ?? '').split('/')
  return vitalsFromForm({
    temperature_c: v.temp,
    heart_rate_bpm: pulse,
    respiratory_rate_bpm: v.rr,
    systolic_bp_mmhg: sys,
    diastolic_bp_mmhg: dia,
    spo2_pct: v.spo2,
    weight_kg: v.weight,
    height_cm: v.height
  })
}

// Kiểm tra theo khoảng nhập + cảnh báo mềm. Trả { errors: [{ key, msg }], warnings: [msg] }.
export function checkVitals(form) {
  const errors = []
  const warnings = []
  for (const d of VITAL_KEYS) {
    const raw = String(form[d.key] ?? '').trim()
    if (!raw) continue
    const v = toNum(raw)
    if (v === null) {
      errors.push({ key: d.key, msg: `${d.label}: enter a number` })
      continue
    }
    if (!d.decimals && !Number.isInteger(v)) errors.push({ key: d.key, msg: `${d.label}: whole number` })
    else if (v < d.hard[0] || v > d.hard[1]) errors.push({ key: d.key, msg: `${d.label}: ${d.hard[0]}–${d.hard[1]} ${d.unit}` })
    else if (d.soft && (v < d.soft[0] || v > d.soft[1])) warnings.push(`${d.label} ${v} ${d.unit}`)
  }
  const sys = toNum(form.systolic_bp_mmhg)
  const dia = toNum(form.diastolic_bp_mmhg)
  if ((sys === null) !== (dia === null)) errors.push({ key: sys === null ? 'systolic_bp_mmhg' : 'diastolic_bp_mmhg', msg: 'Blood pressure: enter both systolic and diastolic' })
  else if (sys !== null && dia !== null && dia >= sys) errors.push({ key: 'diastolic_bp_mmhg', msg: 'Blood pressure: diastolic must be lower than systolic' })
  return { errors, warnings }
}

// Hiển thị gọn: "HR 80 · BP 120/80 · 37.5°C · SpO2 98% · 60 kg".
export function vitalsText(raw, { withWeight = true } = {}) {
  const v = normalizeVitals(raw)
  const parts = []
  if (v.heart_rate_bpm != null) parts.push('HR ' + v.heart_rate_bpm)
  if (v.systolic_bp_mmhg != null) parts.push('BP ' + v.systolic_bp_mmhg + '/' + (v.diastolic_bp_mmhg ?? '—'))
  if (v.temperature_c != null) parts.push(v.temperature_c + '°C')
  if (v.spo2_pct != null) parts.push('SpO2 ' + v.spo2_pct + '%')
  if (v.respiratory_rate_bpm != null) parts.push('RR ' + v.respiratory_rate_bpm)
  if (withWeight && v.weight_kg != null) parts.push(v.weight_kg + ' kg')
  return parts.join(' · ') || '—'
}

// Đầu vào cho bộ luật (ruleEngine dùng khoá ngắn temp / hr / rr / spo2 / sbp).
export function ruleVitals(raw) {
  const v = normalizeVitals(raw)
  return { temp: v.temperature_c ?? null, hr: v.heart_rate_bpm ?? null, rr: v.respiratory_rate_bpm ?? null, spo2: v.spo2_pct ?? null, sbp: v.systolic_bp_mmhg ?? null }
}

// Khoá ngắn của bộ luật → khoá chuẩn (để tô vàng ô cần đo ngay khi luật cờ đỏ còn thiếu dữ liệu).
export const RULE_KEY_TO_VITAL = { temp: 'temperature_c', hr: 'heart_rate_bpm', rr: 'respiratory_rate_bpm', spo2: 'spo2_pct', sbp: 'systolic_bp_mmhg' }
