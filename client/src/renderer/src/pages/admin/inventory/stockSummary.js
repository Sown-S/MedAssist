import { translate } from '../../../i18n'
import { todayISO } from '../../../api/inventoryStore'
import { STATUS, exportCsv, unitLabel, fmtDate } from './shared'

// Thẻ tổng của tab Tồn kho: giá trị tồn dùng được, số thuốc dưới ngưỡng / hết, lô hết hạn và sắp hết hạn theo 30 / 60 / 90 ngày.
export function stockTotals(rows) {
  const t = { value: 0, low: 0, out: 0, expiredQty: 0, expiredValue: 0, w: { 30: 0, 60: 0, 90: 0 } }
  for (const { d, s } of rows) {
    if (!d.active) continue
    t.value += s.value
    if (s.statuses.includes('low')) t.low++
    if (s.statuses.includes('out')) t.out++
    for (const b of s.batches) {
      if (b.days < 0) {
        t.expiredQty++
        t.expiredValue += b.qty * b.cost
      } else for (const w of [30, 60, 90]) if (b.days <= w) t.w[w]++
    }
  }
  return t
}

// Xuất đúng danh sách đang lọc / sắp xếp ra CSV.
export function exportStock(rows) {
  exportCsv(
    `stock-${todayISO()}.csv`,
    ['Drug', 'Active ingredient', 'ATC code', 'Unit', 'Usable stock', 'Expired stock', 'Threshold', 'Days of cover', 'Suggested reorder', 'Nearest expiry', 'Purchase price', 'Selling price', 'Stock value', 'Status'],
    rows.map(({ d, s }) => [
      d.name,
      d.ingredient,
      d.atc,
      translate(unitLabel(d.unit)),
      s.usable,
      s.expired,
      d.threshold,
      s.daysCover ?? '',
      s.reorder || '',
      s.nextExpiry ? fmtDate(s.nextExpiry.expiry) : '',
      d.cost,
      d.price,
      s.value,
      s.statuses.map((x) => translate(STATUS[x].label)).join(' · ')
    ])
  )
}
