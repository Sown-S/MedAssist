import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { labRows } from '../../../api/queueStore'
import { putServiceResults } from '../../../api/serviceApi'
import { toLabOrder, apiMessage } from '../../../api/serviceStore'

// Kết quả cận lâm sàng bác sĩ nhập trên phiếu khám (d.labResults / d.labConclusions), ghi về phiếu chỉ định.
export function useLabResults({ visit, d, set, so }) {
  const { showToast } = useToast()
  const labOrders = so.orders
  const resultOf = (r) => d.labResults[r.key] ?? r.result
  const conclusionOf = (o) => (d.labConclusions ?? {})[o.id] ?? o.conclusion

  // Ghi kết quả từng dòng và kết luận từng phiếu đã sửa. Trả false nếu lỗi.
  async function saveLabResults({ toast = false } = {}) {
    if (!labOrders.length) return true
    const items = labOrders
      .flatMap(labRows)
      .filter((r) => !r.cancelled && r.key in d.labResults && (d.labResults[r.key] ?? '').trim() !== r.result)
      .map((r) => ({ item_id: r.itemId, result: d.labResults[r.key].trim() || null }))
    const conclusions = labOrders
      .filter((o) => o.id in (d.labConclusions ?? {}) && d.labConclusions[o.id].trim() !== o.conclusion)
      .map((o) => ({ order_id: o.id, conclusion: d.labConclusions[o.id].trim() || null }))
    if (!items.length && !conclusions.length) {
      if (toast) showToast('Lab results are already saved')
      return true
    }
    try {
      const list = await putServiceResults(visit.id, items, conclusions)
      so.setOrders(list.map(toLabOrder))
      set({ labResults: {}, labConclusions: {} })
      if (toast) showToast('Lab results saved')
      return true
    } catch (e) {
      showToast(translate(apiMessage(e)), 'error')
      return false
    }
  }
  return { labOrders, resultOf, conclusionOf, saveLabResults }
}
