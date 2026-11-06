import { useEffect, useState } from 'react'
import { getHistory } from '../../../api/emrApi'

// Các lần khám trước của bệnh nhân (GET /patients/{id}/history, mới nhất trước), đổi về dạng dòng mà phiếu khám dùng:
// "Lần khám trước" và nút lặp lại đơn gần nhất.
const historyItem = (x) => {
  const dx = x.diagnoses.find((g) => g.is_primary) ?? x.diagnoses[0]
  return {
    id: x.visit_id,
    statusAt: x.visit_date,
    rxAt: x.prescription?.confirmed_at ?? null,
    diagnosis: dx ? [dx.icd10_code, dx.diagnosis_name].filter(Boolean).join(' — ') : '',
    rx: (x.prescription?.items ?? []).map((l) => ({ name: l.drug_label, qty: l.quantity, unit: l.unit, usage: `${l.dosage} — ${l.frequency} — ${l.duration_days} ngày` }))
  }
}
export function usePastVisits(visit) {
  const [past, setPast] = useState([])
  useEffect(() => {
    let alive = true
    getHistory(visit.patientId, { limit: 10 }).then(
      (h) => alive && setPast(h.items.filter((x) => x.visit_id !== visit.id).map(historyItem)),
      () => {}
    )
    return () => {
      alive = false
    }
  }, [visit.patientId, visit.id])
  return past
}
