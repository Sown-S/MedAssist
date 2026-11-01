import { translate } from '../../../i18n'
import { VI } from '../../../i18n/vi'
import { labRows } from '../../../api/queueStore'
import { unitLabel } from '../../admin/inventory/shared'
import { findServerDrug } from '../../../api/serverDrugs'
import { getDraft, saveDraft } from '../../../api/draftStore'
import { normalizeVitals, vitalsToForm } from '../../../api/vitals'

// Đơn mẫu theo hoạt chất + hàm lượng (+ dạng bào chế ưu tiên), tra ra thuốc của danh mục server lúc áp dụng: tên hiển thị
// của server ghép từ tên thương mại nên không so theo tên. Cách dùng viết tiếng Việt vì đơn in cho bệnh nhân.
const dose = (m, n, a, e, days, meal = 'after') => ({ m: m ? String(m) : '', n: n ? String(n) : '', a: a ? String(a) : '', e: e ? String(e) : '', days: String(days), meal })
export const RX = {
  throat: [
    { generic: 'Amoxicilin', strength: '500 mg', form: 'viên nang', qty: 20, usage: 'Sáng 1 viên, Tối 1 viên — uống sau ăn — 10 ngày', dose: dose(1, 0, 0, 1, 10) },
    { generic: 'Paracetamol', strength: '500 mg', form: 'viên nén', qty: 10, usage: 'Uống khi sốt trên 38,5°C, cách nhau ít nhất 4–6 giờ' }
  ],
  gastric: [{ generic: 'Omeprazol', strength: '20 mg', form: 'viên nang', qty: 14, usage: 'Sáng 1 viên — uống trước ăn — 14 ngày', dose: dose(1, 0, 0, 0, 14, 'before') }],
  diabetes: [{ generic: 'Metformin', strength: '500 mg', form: 'viên', qty: 60, usage: 'Sáng 1 viên, Tối 1 viên — uống sau ăn — 30 ngày', dose: dose(1, 0, 0, 1, 30) }],
  rash: [{ generic: 'Loratadin', strength: '10 mg', form: 'viên', qty: 10, usage: 'Tối 1 viên — 10 ngày', dose: dose(0, 0, 0, 1, 10, '') }],
  pain: [{ generic: 'Ibuprofen', strength: '400 mg', form: 'viên', qty: 10, usage: 'Uống khi đau, sau ăn, tối đa 3 lần/ngày' }]
}

const key = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, '')
// Thuốc đang dùng cùng hoạt chất và hàm lượng; nhiều thuốc khớp thì ưu tiên đúng dạng bào chế rồi tới thuốc còn tồn.
export function drugForTemplate(t, drugs) {
  const hits = drugs.filter((d) => d.active !== false && key(d.ingredient) === key(t.generic) && key(d.strength) === key(t.strength))
  const score = (d) => (key(d.form).includes(key(t.form)) ? 2 : 0) + ((d.stock?.usable ?? 0) > 0 ? 1 : 0)
  return hits.sort((a, b) => score(b) - score(a))[0] ?? null
}

// Liều có cấu trúc: Sáng / Trưa / Chiều / Tối × số ngày → tự tính số lượng và câu cách dùng.
export const SLOTS = [
  ['m', 'Morning', 'Sáng'],
  ['n', 'Noon', 'Trưa'],
  ['a', 'Afternoon', 'Chiều'],
  ['e', 'Evening', 'Tối']
]

export const MEALS = [
  { key: 'after', label: 'After meals', vi: 'sau ăn' },
  { key: 'before', label: 'Before meals', vi: 'trước ăn' },
  { key: '', label: 'Any time', vi: '' }
]

export const blankDose = () => ({ m: '', n: '', a: '', e: '', days: '', meal: 'after' })

export const num = (x) => parseFloat(String(x ?? '').replace(',', '.')) || 0

export const perDay = (dose) => SLOTS.reduce((s, [k]) => s + num(dose?.[k]), 0)

export const unitVi = (unit) => (VI[unitLabel(unit)] ?? unitLabel(unit)).toLowerCase()

export function usageOf(dose, unit) {
  const parts = SLOTS.filter(([k]) => num(dose[k]) > 0).map(([k, , vi]) => `${vi} ${dose[k]} ${unitVi(unit)}`)
  if (!parts.length) return ''
  const meal = MEALS.find((m) => m.key === dose.meal)?.vi
  return parts.join(', ') + (meal ? ` — uống ${meal}` : '') + (num(dose.days) ? ` — ${num(dose.days)} ngày` : '')
}

// Tồn lấy từ server (chỉ lô còn hạn); lô đủ hạn cho cả liệu trình do server kiểm khi xác nhận đơn.
export function serverStockIssue(item, drugs) {
  const d = (item.drugId && drugs.find((x) => x.id === item.drugId)) || findServerDrug(item.name, drugs)
  if (!d) return drugs.length ? { level: 'danger', text: 'Not in the drug catalog on the server' } : null
  const need = parseInt(item.qty, 10) || 0
  if (!d.active) return { level: 'danger', text: 'Discontinued in the drug catalog' }
  if (d.stock.usable === 0 && d.stock.expired > 0) return { level: 'danger', text: 'Only expired batches left — cannot be dispensed' }
  if (d.stock.usable === 0) return { level: 'danger', text: 'Out of stock' }
  if (d.stock.usable < need) return { level: 'caution', text: 'Not enough stock', usable: d.stock.usable, unit: d.unit }
  return null
}

let seq = 0
export const nextLineId = () => 'r' + Date.now() + '-' + ++seq

// drugId: id thuốc trên server; dòng chép từ đơn cũ / đơn mẫu không có thì tra theo tên lúc chốt.
export const lineOf = (d) => ({ id: nextLineId(), drugId: d.id, name: d.name, qty: '', unit: d.unit, usage: '', essential: !!d.essential, dose: blankDose() })

// Dòng thuốc → PrescriptionItemIn của server. Liều có cấu trúc: liều từng cữ + số lần / ngày + số ngày;
// thuốc dùng khi cần: cách dùng ghi tay, số ngày tính từ số lượng nếu được. Trả { item } hoặc { error }.
export function serverItem(l, drugs) {
  const drug = (l.drugId && drugs.find((x) => x.id === l.drugId)) || findServerDrug(l.name, drugs)
  if (!drug) return { error: translate('Not in the drug catalog on the server') + ': ' + l.name }
  const qty = parseInt(l.qty, 10)
  const daily = perDay(l.dose)
  const days = num(l.dose?.days) > 0 ? Math.round(num(l.dose.days)) : daily > 0 && qty > 0 ? Math.ceil(qty / daily) : 0
  if (!(days > 0)) return { error: translate('Enter the number of days for') + ' ' + l.name }
  const slots = SLOTS.filter(([k]) => num(l.dose?.[k]) > 0)
  const unit = unitVi(l.unit)
  const dosage = slots.length ? slots.map(([k, , vi]) => `${vi} ${l.dose[k]} ${unit}`).join(', ') : l.usage.trim()
  const meal = MEALS.find((m) => m.key === l.dose?.meal)?.vi
  const frequency = slots.length ? `${slots.length} lần/ngày` + (meal ? `, ${meal}` : '') : 'Theo hướng dẫn'
  return {
    item: {
      drug_id: drug.id,
      dosage: dosage.slice(0, 100),
      frequency: frequency.slice(0, 100),
      duration_days: days,
      quantity: qty,
      instruction: l.usage.trim().slice(0, 1000) || null
    },
    line: { ...l, drugId: drug.id }
  }
}

export function initDraft(v) {
  return {
    exam: v.exam ?? '',
    plan: v.plan ?? '',
    diagnosis: v.diagnosis ?? '',
    diagnosesExtra: v.diagnosesExtra ?? [],
    hpi: v.hpi ?? '',
    followUp: v.followUp ?? '',
    rx: (v.rx ?? []).map((l, i) => ({ id: 'r' + i, name: l.name, qty: String(l.qty ?? ''), unit: l.unit, usage: l.usage ?? '', essential: !!l.essential, dose: { ...blankDose(), ...l.dose } })),
    vitals: vitalsToForm(normalizeVitals(v.vitals)),
    labResult: v.labResult ?? '',
    // Kết luận theo từng phiếu { "<order_id>": kết luận } — chỉ giữ phiếu bác sĩ đang sửa.
    labConclusions: {},
    labResults: Object.fromEntries((v.labOrders ?? []).flatMap(labRows).map((r) => [r.key, r.result]))
  }
}

// Ưu tiên: dữ liệu lượt khám → phiếu dở được bàn giao kèm → phiếu dở trên máy này.
export function draftOf(v) {
  const d = { ...initDraft(v), ...(v.released?.draft ?? {}), ...getDraft(v.id) }
  // Phiếu nháp cũ (pulse / bp / temp…) → khoá sinh hiệu chuẩn.
  return { ...d, vitals: vitalsToForm(normalizeVitals(d.vitals)) }
}

export function addDrugToDraft(visit, d) {
  const dr = draftOf(visit)
  if (!dr.rx.some((x) => x.name === d.name)) saveDraft(visit.id, { ...dr, rx: [...dr.rx, lineOf(d)] })
}
