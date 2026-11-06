import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { findDrugByName } from '../../../api/inventoryStore'
import { findServerDrug } from '../../../api/serverDrugs'
import { RX, drugForTemplate, blankDose, num, perDay, usageOf, nextLineId, lineOf } from './rxDraft'

// Thao tác trên các dòng thuốc của phiếu khám: sửa dòng, liều, thêm thuốc, áp đơn mẫu / lặp lại đơn cũ.
// d / set là bản nháp phiếu khám của ConsultForm.
export function useRxLines({ d, set, setD, srvDrugs, invDrugs }) {
  const { showToast } = useToast()
  const setLine = (id, patch) => setD((x) => ({ ...x, rx: x.rx.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
  // Tự tính số lượng và câu cách dùng (vẫn sửa tay được sau đó).
  function setDose(line, patch) {
    const dose = { ...line.dose, ...patch }
    const daily = perDay(dose)
    const auto = daily > 0 ? { usage: usageOf(dose, line.unit), ...(num(dose.days) > 0 ? { qty: String(Math.ceil(daily * num(dose.days))) } : {}) } : {}
    setLine(line.id, { dose, ...auto })
  }
  function addDrug(drug) {
    if (d.rx.some((x) => x.name === drug.name)) return showToast(translate('This drug is already on the prescription.'), 'error')
    set({ rx: [...d.rx, lineOf(drug)] })
  }
  function applyLines(lines) {
    const have = new Set(d.rx.map((x) => x.name))
    const add = lines
      .filter((l) => !have.has(l.name))
      .map((l) => ({
        id: nextLineId(),
        drugId: findServerDrug(l.name, srvDrugs)?.id,
        name: l.name,
        qty: String(l.qty),
        unit: l.unit,
        usage: l.usage,
        essential: !!findDrugByName(l.name, invDrugs)?.essential,
        dose: { ...blankDose(), ...l.dose }
      }))
    if (!add.length) return showToast(translate('These drugs are already on the prescription.'), 'error')
    set({ rx: [...d.rx, ...add] })
  }
  // Đơn mẫu: tra từng dòng ra thuốc của danh mục server (có drug_id) để chốt được; thuốc không có thì bỏ qua và báo.
  function applyTemplate(tk) {
    const missing = []
    const lines = RX[tk].flatMap((t) => {
      const drug = drugForTemplate(t, srvDrugs)
      if (!drug) {
        missing.push(t.generic + ' ' + t.strength)
        return []
      }
      return [{ ...lineOf(drug), qty: String(t.qty), usage: t.usage, dose: { ...blankDose(), ...t.dose } }]
    })
    if (missing.length) showToast(translate('Not in the drug catalog on the server') + ': ' + missing.join(', '), 'error')
    const add = lines.filter((l) => !d.rx.some((x) => x.drugId === l.drugId || x.name === l.name))
    if (add.length) set({ rx: [...d.rx, ...add] })
    else if (!missing.length) showToast(translate('These drugs are already on the prescription.'), 'error')
  }
  return { setLine, setDose, addDrug, applyLines, applyTemplate }
}
