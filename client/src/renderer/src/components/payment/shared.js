import { money } from '../../lib/format'

// Tiền trên phiếu thanh toán không âm (VD tiền thừa khi khách đưa thiếu hiện 0đ).
export const fmt = (n) => money(Math.max(Number(n) || 0, 0))
