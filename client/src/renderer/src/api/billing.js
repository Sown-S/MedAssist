// Dòng hoá đơn của một lượt (bản demo): phí khám + thuốc theo đơn, giá lấy từ danh mục.
// Dùng chung để mọi màn ra cùng một số tiền.
import { getInventory, findDrugByName } from './inventoryStore'
import { getSettings } from './settingsStore'
import { soldOutside } from './rxSafety'
import { activeInvoiceOf } from './invoiceStore'

export function buildItems(visit) {
  const { drugs } = getInventory()
  const fee = { id: 'fee1', name: 'Consultation fee', sub: 'Basic consultation fee', cat: 'fee', amt: getSettings().ops.consultFee, checked: true }
  // Thuốc nhà thuốc phòng khám không bán (N/H) không lên hoá đơn.
  const lines = (visit?.rx ?? []).filter((l) => !soldOutside(findDrugByName(l.name, drugs))).map((l, i) => {
    const d = findDrugByName(l.name, drugs)
    return {
      id: 'rx' + i,
      name: l.name,
      sub: l.usage,
      qty: l.qty,
      cat: 'drug',
      drugId: d?.id,
      unit: d?.price ?? 0,
      unitName: d?.unit,
      essential: !!d?.essential,
      chip: d?.essential ? 'Essential' : null,
      checked: true
    }
  })
  return [fee, ...lines]
}

export function outsideLines(visit) {
  const { drugs } = getInventory()
  return (visit?.rx ?? []).filter((l) => soldOutside(findDrugByName(l.name, drugs)))
}

export const lineAmount = (it) => (it.cat === 'drug' ? it.unit * it.qty : it.amt)

// Lượt cũ chưa có hoá đơn thì tạm tính từ đơn.
export const estimateTotal = (visit) => activeInvoiceOf(visit?.id)?.total ?? buildItems(visit).reduce((s, it) => s + lineAmount(it), 0)
