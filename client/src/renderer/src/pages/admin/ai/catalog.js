// Quy tắc dựng từ mã có cấu trúc (triệu chứng, sinh hiệu, ICD-10) thay vì chữ tự do — để so khớp được
// và phát hiện quy tắc trùng.

export const RULE_TYPES = [
  { key: 'redflag', label: 'Red flag', short: 'Red flag', tone: 'low' },
  { key: 'priority', label: 'Priority', short: 'Priority', tone: 'warn' },
  { key: 'dx', label: 'Diagnosis suggestion', short: 'Diagnosis', tone: 'info' }
]
export const typeOf = (key) => RULE_TYPES.find((t) => t.key === key) ?? RULE_TYPES[2]

export const SYMPTOMS = [
  { key: 'fever', label: 'Fever' },
  { key: 'cough_dry', label: 'Dry cough' },
  { key: 'cough_productive', label: 'Productive cough' },
  { key: 'sore_throat', label: 'Sore throat' },
  { key: 'tonsil_exudate', label: 'Tonsillar exudate' },
  { key: 'runny_nose', label: 'Runny nose' },
  { key: 'sneezing', label: 'Sneezing' },
  { key: 'headache', label: 'Headache' },
  { key: 'neck_stiffness', label: 'Neck stiffness' },
  { key: 'chest_pain', label: 'Chest pain' },
  { key: 'dyspnea', label: 'Shortness of breath' },
  { key: 'epigastric_pain', label: 'Epigastric pain' },
  { key: 'acid_reflux', label: 'Acid reflux' },
  { key: 'vomiting', label: 'Vomiting' },
  { key: 'rash', label: 'Rash' },
  { key: 'altered_consciousness', label: 'Altered consciousness' }
]
export const symptomLabel = (key) => SYMPTOMS.find((s) => s.key === key)?.label ?? key

export const VITALS = [
  { key: 'temp', label: 'Temperature', unit: '°C', step: 0.1, min: 34, max: 43 },
  { key: 'hr', label: 'Heart rate', unit: 'bpm', step: 1, min: 20, max: 250 },
  { key: 'rr', label: 'Respiratory rate', unit: '/min', step: 1, min: 5, max: 80 },
  { key: 'spo2', label: 'SpO₂', unit: '%', step: 1, min: 50, max: 100 },
  { key: 'sbp', label: 'Systolic BP', unit: 'mmHg', step: 1, min: 40, max: 260 }
]
export const vitalOf = (key) => VITALS.find((v) => v.key === key) ?? VITALS[0]

export const OPS = [
  { key: '>', label: '>' },
  { key: '>=', label: '≥' },
  { key: '<', label: '<' },
  { key: '<=', label: '≤' }
]
export const opLabel = (key) => OPS.find((o) => o.key === key)?.label ?? key

// ICD-10 rút gọn cho bản demo.
export const ICD10 = [
  { code: 'J02.9', label: 'Acute pharyngitis, unspecified' },
  { code: 'J03.9', label: 'Acute tonsillitis, unspecified' },
  { code: 'J06.9', label: 'Acute upper respiratory infection, unspecified' },
  { code: 'J20.9', label: 'Acute bronchitis, unspecified' },
  { code: 'J18.9', label: 'Pneumonia, unspecified' },
  { code: 'J42', label: 'Unspecified chronic bronchitis' },
  { code: 'J30.4', label: 'Allergic rhinitis, unspecified' },
  { code: 'K29.7', label: 'Gastritis, unspecified' },
  { code: 'K21.9', label: 'Gastro-oesophageal reflux disease without oesophagitis' },
  { code: 'I24.9', label: 'Acute ischaemic heart disease, unspecified' },
  { code: 'G03.9', label: 'Meningitis, unspecified' },
  { code: 'A91', label: 'Dengue haemorrhagic fever' },
  { code: 'R06.0', label: 'Dyspnoea' },
  { code: 'R50.9', label: 'Fever, unspecified' }
]
export const icdLabel = (code) => ICD10.find((i) => i.code === code)?.label ?? ''

// Mỗi mức gắn với hành vi cụ thể ở màn kê đơn.
export const DDI_LEVELS = [
  { key: 'contraindicated', label: 'Contraindicated', action: 'Block prescribing', tone: 'low' },
  { key: 'severe', label: 'Severe', action: 'Require an override reason', tone: 'warn' },
  { key: 'warning', label: 'Warning', action: 'Reminder only', tone: 'info' }
]
export const levelOf = (key) => DDI_LEVELS.find((l) => l.key === key) ?? DDI_LEVELS[2]

export const DDI_TYPES = [
  { key: 'ddi', label: 'Drug–Drug' },
  { key: 'condition', label: 'Drug–Condition' },
  { key: 'allergy', label: 'Cross-allergy' },
  { key: 'dose', label: 'Dose limit' },
  { key: 'class', label: 'Same class (duplicate therapy)' }
]
export const ddiTypeLabel = (key) => DDI_TYPES.find((t) => t.key === key)?.label ?? key

export const DISMISS_REASONS = [
  { key: 'differs', label: 'Clinical picture differs' },
  { key: 'known', label: 'Already diagnosed' },
  { key: 'info', label: 'Insufficient information' },
  { key: 'broad', label: 'Rule too broad' }
]

// Luôn 2 chữ số thập phân để các dòng thẳng hàng.
export const fmtWeight = (w) => (Number.isFinite(+w) ? (+w).toFixed(2) : '—')
export const fmtPct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + '%' : '—')

export function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
