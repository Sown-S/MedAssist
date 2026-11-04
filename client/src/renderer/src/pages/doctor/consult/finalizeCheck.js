import { checkVitals } from '../../../api/vitals'
import { num, isChild } from './rxDraft'

// FR03: hệ thống không đánh giá đơn, chỉ nhắc dị ứng / bệnh nền. Chỉ chặn khi thiếu dữ liệu bắt buộc:
// chẩn đoán, số lượng + cách dùng, cân nặng trẻ em.
export function finalizeCheck(visit, d) {
  const incomplete = d.rx.some((l) => !(parseInt(l.qty) > 0) || !l.usage.trim())
  const needWeight = isChild(visit) && d.rx.length > 0 && !(num(d.vitals.weight_kg) > 0)
  const vitalErr = checkVitals(d.vitals).errors
  const problem = !d.diagnosis.trim()
    ? 'Enter the diagnosis before finalizing.'
    : incomplete
      ? 'Enter the quantity and directions for every drug.'
      : needWeight
        ? 'Enter the child’s weight (kg) before finalizing — it is printed on the prescription.'
        : vitalErr.length
          ? 'Check the vital signs before finalizing.'
          : null
  return { problem, needWeight, vitalErr }
}

// Bệnh sử / khám / hướng xử trí gộp thành ghi chú lâm sàng gửi kèm chẩn đoán (server giới hạn 4000 ký tự).
export const clinicalNotes = (d) =>
  [
    d.hpi.trim() && 'Bệnh sử: ' + d.hpi.trim(),
    typeof d.exam === 'string' && d.exam.trim() && 'Khám: ' + d.exam.trim(),
    typeof d.plan === 'string' && d.plan.trim() && 'Hướng xử trí: ' + d.plan.trim()
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000)
