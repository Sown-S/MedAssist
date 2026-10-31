import { translate } from '../../../i18n'
import { VI } from '../../../i18n/vi'
import { labRows } from '../../../api/queueStore'
import { findDrugByName, stockOf, eligibleFor, daysLeft } from '../../../api/inventoryStore'
import { soldOutside } from '../../../api/rxSafety'
import { unitLabel } from '../../admin/inventory/shared'
import { DEMO_MODE } from '../../../api/client'
import { findServerDrug } from '../../../api/serverDrugs'
import { getDraft, saveDraft } from '../../../api/draftStore'
import { normalizeVitals, vitalsToForm } from '../../../api/vitals'

// ---------- Liều có cấu trúc: Sáng / Trưa / Chiều / Tối × số ngày → tự tính số lượng + câu cách dùng ----------
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

export function stockIssue(item, inv) {
  const d = findDrugByName(item.name, inv.drugs)
  if (!d) return null
  // Thuốc N/H nhà thuốc phòng khám không bán → bệnh nhân mua ngoài, không cần tồn kho ở đây.
  if (soldOutside(d)) return { level: 'info', text: 'Bought at an outside pharmacy — not dispensed here' }
  const need = parseInt(item.qty, 10) || 0
  const s = stockOf(d, inv.batches)
  if (!d.active) return { level: 'danger', text: 'Discontinued in the drug catalog' }
  if (s.usable === 0 && s.expired > 0) return { level: 'danger', text: 'Only expired batches left — cannot be dispensed' }
  if (s.usable === 0) return { level: 'danger', text: 'Out of stock' }
  // Giống lúc trừ kho thật khi chốt đơn: chỉ tính lô còn hạn qua hết đợt dùng thuốc (số ngày ở cách dùng).
  const days = Number(item.dose?.days) || 0
  const ok = inv.batches.filter((b) => b.drugId === d.id && b.qty > 0 && daysLeft(b.expiry) >= 0 && eligibleFor(b, days)).reduce((n, b) => n + b.qty, 0)
  if (need && ok < need && s.usable >= need) return { level: 'caution', text: 'Some batches expire before the course ends — not enough stock that stays valid', usable: ok, unit: d.unit }
  if (s.usable < need) return { level: 'caution', text: 'Not enough stock', usable: s.usable, unit: d.unit }
  return null
}

// Backend thật: tồn lấy từ v_drug_stock của server (còn hạn). Lô đủ hạn cho cả liệu trình do server kiểm khi xác nhận đơn.
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

// Bản nháp phiếu khám theo từng lượt khám — giữ lại khi bác sĩ chuyển qua lại giữa các bệnh nhân / các màn,
// và lưu xuống máy (draftStore) để tắt app không mất phiếu đang viết dở.
let seq = 0
export const nextLineId = () => 'r' + Date.now() + '-' + ++seq

// drugId: id thuốc trên server (backend thật) — dòng chép từ đơn cũ / đơn mẫu không có thì tra theo tên lúc chốt.
export const lineOf = (d) => ({ id: nextLineId(), drugId: DEMO_MODE ? undefined : d.id, name: d.name, qty: '', unit: d.unit, usage: '', essential: !!d.essential, dose: blankDose() })

// Dòng thuốc trên phiếu → PrescriptionItemIn của server. Liều có cấu trúc: liều từng cữ + số lần/ngày + số ngày;
// thuốc dùng khi cần: cách dùng ghi tay, số ngày tính từ số lượng nếu có thể. Trả { item } hoặc { error }.
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
    // Sinh hiệu dạng 8 khoá chuẩn (chuỗi đang gõ) — đo lúc tiếp đón, bác sĩ đo lại được.
    vitals: vitalsToForm(normalizeVitals(v.vitals)),
    labResult: v.labResult ?? '',
    // Backend thật: kết luận theo từng phiếu chỉ định { "<order_id>": kết luận } — chỉ giữ chỗ bác sĩ đang sửa.
    labConclusions: {},
    // Kết quả theo từng xét nghiệm của các phiếu chỉ định: { "<mã phiếu>:<mã xét nghiệm>": kết quả }
    labResults: Object.fromEntries((v.labOrders ?? []).flatMap(labRows).map((r) => [r.key, r.result]))
  }
}

// Thứ tự ưu tiên: dữ liệu lượt khám → phiếu dở được bàn giao kèm theo → phiếu dở trên máy này.
export function draftOf(v) {
  const d = { ...initDraft(v), ...(v.released?.draft ?? {}), ...getDraft(v.id) }
  // Phiếu nháp lưu từ bản cũ (pulse / bp / temp…) → đổi sang 8 khoá chuẩn.
  return { ...d, vitals: vitalsToForm(normalizeVitals(d.vitals)) }
}

export function addDrugToDraft(visit, d) {
  const dr = draftOf(visit)
  if (!dr.rx.some((x) => x.name === d.name)) saveDraft(visit.id, { ...dr, rx: [...dr.rx, lineOf(d)] })
}
