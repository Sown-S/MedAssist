// Thuốc kiểm soát đặc biệt (đơn "N" gây nghiện / "H" hướng thần): phân loại và quyết định nhà thuốc phòng khám có bán không.
import { getSettings } from './settingsStore'

// Loại đơn riêng theo khai báo ở danh mục; thuốc chưa khai báo thì đoán theo ATC: N02A = 'N', còn lại 'H'.
export function controlledKind(drug) {
  if (!drug || drug.group !== 'controlled') return null
  return drug.controlledType ?? ((drug.atc ?? '').startsWith('N02A') ? 'N' : 'H')
}

// Thuốc N / H nhà thuốc phòng khám không bán → không tính tiền, không xuất kho, bệnh nhân mua ngoài.
export const sellsControlled = () => !!getSettings().ops.sellControlled
export const soldOutside = (drug) => !!controlledKind(drug) && !sellsControlled()
export const CONTROLLED_LABEL = { N: 'Narcotic (prescription “N”)', H: 'Psychotropic (prescription “H”)' }
