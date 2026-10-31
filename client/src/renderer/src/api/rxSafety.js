// Quy tắc an toàn kê đơn THEO QUY ĐỊNH (khác rxChecks.js — tương tác thuốc theo danh mục chuyên môn):
//  1. Thuốc gây nghiện (N) / hướng thần (H): kê trên ĐƠN RIÊNG, phải có liều theo ngày + số ngày, không vượt số ngày tối đa.
//  2. Giới hạn số ngày dùng của mọi thuốc (thuốc thường, kháng sinh).
//  3. Trùng thuốc với đơn cũ CÒN HẠN (đơn trước chưa uống hết).
// CÁC CON SỐ DƯỚI ĐÂY LÀ CẤU HÌNH MẪU — phải đối chiếu quy định kê đơn ngoại trú hiện hành của Bộ Y tế trước khi dùng thật.
// Backend thật: server kiểm tra lại cùng bộ quy tắc khi chốt đơn.
import { findDrugByName, getInventory } from './inventoryStore'
import { getSettings } from './settingsStore'

export const RX_LIMITS = {
  narcotic: 7, // thuốc gây nghiện (đơn "N") — điều trị cấp tính
  psychotropic: 10, // thuốc hướng thần (đơn "H")
  general: 30, // thuốc thường — tối đa mỗi lần kê
  antibioticWarn: 14 // kháng sinh toàn thân (ATC J01) — quá số ngày này thì nhắc (không chặn)
}

// Loại đơn riêng của thuốc kiểm soát đặc biệt: theo khai báo ở Danh mục thuốc (controlledType);
// thuốc cũ chưa khai báo thì đoán theo ATC: N02A (opioid) = 'N' gây nghiện, còn lại 'H' hướng thần. null = thuốc thường.
export function controlledKind(drug) {
  if (!drug || drug.group !== 'controlled') return null
  return drug.controlledType ?? ((drug.atc ?? '').startsWith('N02A') ? 'N' : 'H')
}

// Liều theo ngày (mg) của 1 dòng thuốc và giới hạn áp dụng cho bệnh nhân này.
// Trẻ < 12 tuổi có cân nặng + thuốc có mg/kg/ngày → giới hạn = mg/kg/ngày × cân nặng (không vượt liều người lớn);
// còn lại dùng liều tối đa người lớn. Không đủ dữ liệu (thuốc dùng khi cần, chưa khai hàm lượng) → null.
export function doseCheck(line, drug, patient) {
  if (!drug?.strengthMg) return null
  const daily = perDay(line.dose) * drug.strengthMg
  if (!(daily > 0)) return null
  const weight = num(patient?.weight)
  const child = patient?.age !== '' && patient?.age != null && Number(patient.age) < 12
  if (child && drug.maxMgKgDay && weight > 0) {
    const perKg = drug.maxMgKgDay * weight
    const limit = drug.maxMgDay ? Math.min(perKg, drug.maxMgDay) : perKg
    return { daily, limit: Math.round(limit), basis: 'kg', perKg: drug.maxMgKgDay, weight }
  }
  if (child && !drug.maxMgKgDay) return { daily, limit: null, basis: 'none' }
  return drug.maxMgDay ? { daily, limit: drug.maxMgDay, basis: 'adult' } : { daily, limit: null, basis: 'none' }
}
// Thuốc N/H mà nhà thuốc phòng khám KHÔNG bán (Cài đặt › Vận hành) → không tính tiền, không xuất kho, bệnh nhân mua ngoài.
export const sellsControlled = () => !!getSettings().ops.sellControlled
export const soldOutside = (drug) => !!controlledKind(drug) && !sellsControlled()
export const soldOutsideByName = (name) => soldOutside(findDrugByName(name, getInventory().drugs))
export const CONTROLLED_LABEL = { N: 'Narcotic (prescription “N”)', H: 'Psychotropic (prescription “H”)' }

const num = (x) => parseFloat(String(x ?? '').replace(',', '.')) || 0
const perDay = (dose) => ['m', 'n', 'a', 'e'].reduce((s, k) => s + num(dose?.[k]), 0)
// Số ngày dùng của 1 dòng thuốc: theo liều có cấu trúc; không có thì null (thuốc dùng khi cần).
export const daysOf = (line) => (num(line.dose?.days) > 0 ? num(line.dose.days) : perDay(line.dose) > 0 && num(line.qty) > 0 ? Math.ceil(num(line.qty) / perDay(line.dose)) : null)

const DAY = 86400000
const sameDrug = (a, b) => a && b && (a.id === b.id || (a.ingredient && b.ingredient && a.ingredient.toLowerCase() === b.ingredient.toLowerCase()))

// lines: dòng thuốc đang kê; past: các lượt khám trước của bệnh nhân (có rx, rxAt); drugs: danh mục thuốc.
// Trả về [{ key, level: 'block' | 'warning', kind, drug, ... }] — 'block' chặn chốt đơn.
// patient: { age, weight } — để kiểm tra liều theo cân nặng. Liều vượt tối đa = 'severe' (phải ghi lý do mới chốt được).
export function checkRxSafety(lines, past, drugs, now = Date.now(), patient = null) {
  const out = []
  for (const l of lines) {
    const d = findDrugByName(l.name, drugs)
    const dc = doseCheck(l, d, patient)
    if (dc?.limit && dc.daily > dc.limit) out.push({ key: 'dose' + l.id, level: 'severe', kind: dc.basis === 'kg' ? 'dose_kg' : 'dose_day', drug: l.name, ...dc })
    const days = daysOf(l)
    const ck = controlledKind(d)
    if (ck) {
      const max = ck === 'N' ? RX_LIMITS.narcotic : RX_LIMITS.psychotropic
      if (!(num(l.dose?.days) > 0) || !(perDay(l.dose) > 0)) out.push({ key: 'cd-dose' + l.id, level: 'block', kind: 'controlled_dose', drug: l.name, ck })
      else if (days > max) out.push({ key: 'cd-days' + l.id, level: 'block', kind: 'controlled_days', drug: l.name, ck, days, max })
    } else if (days != null && days > RX_LIMITS.general) out.push({ key: 'gen' + l.id, level: 'block', kind: 'general_days', drug: l.name, days, max: RX_LIMITS.general })
    else if (days != null && (d?.atc ?? '').startsWith('J01') && days > RX_LIMITS.antibioticWarn)
      out.push({ key: 'ab' + l.id, level: 'warning', kind: 'antibiotic_days', drug: l.name, days, max: RX_LIMITS.antibioticWarn })

    // Trùng với đơn cũ còn hạn: cùng thuốc / cùng hoạt chất, ngày kê + số ngày dùng vẫn sau hôm nay.
    for (const v of past) {
      if (!v.rxAt) continue
      for (const old of v.rx ?? []) {
        const od = findDrugByName(old.name, drugs)
        if (!(old.name === l.name || sameDrug(od, d))) continue
        const oldDays = daysOf(old)
        if (!oldDays) continue
        const end = new Date(v.rxAt).getTime() + oldDays * DAY
        if (end > now)
          out.push({ key: 'dup' + l.id + v.id, level: 'warning', kind: 'duplicate', drug: l.name, oldDrug: old.name, rxAt: v.rxAt, left: Math.ceil((end - now) / DAY), doctor: v.doctor })
      }
    }
  }
  return out
}
