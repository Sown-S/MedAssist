// Phiếu khám DỞ của bác sĩ (SOAP, sinh hiệu, đơn đang kê...) theo từng lượt khám — lưu lại để tắt app / app treo không mất.
// Chỉ giữ trong ngày; sang ngày mới thì phiếu dở được đính kèm vào lượt khám đã lưu trữ (xem staleDraft). Không ghi nhật ký vì chưa phải dữ liệu chính thức.
// Backend thật: có thể bỏ qua (lưu cục bộ trên máy bác sĩ là đủ) hoặc PUT /visits/{id}/draft.
import { dayOf } from './invoiceStore'

const KEY = 'medassist_consult_drafts_v1'
const today = () => dayOf(new Date().toISOString())

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
const saved = read()
let drafts = saved?.day === today() ? saved.drafts : {}
// Phiếu dở của NGÀY CŨ: không bỏ ngay — hàng chờ (queueStore.rollOver) đính kèm vào lượt khám "bỏ về" khi lưu trữ,
// để ghi chép lâm sàng đã viết không bị mất mà không ai hay.
const stale = saved?.day && saved.day !== today() ? saved.drafts ?? {} : {}
export const staleDraft = (visitId) => stale[visitId]
let timer = null
// Gõ phím nào cũng lưu thì nặng → gom lại, ghi sau 400 ms.
function persist() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ day: today(), drafts }))
    } catch {
      /* chỉ giữ trong phiên */
    }
  }, 400)
}

export const getDraft = (visitId) => drafts[visitId]
export function saveDraft(visitId, d) {
  drafts = { ...drafts, [visitId]: d }
  persist()
}
export function deleteDraft(visitId) {
  if (!(visitId in drafts)) return
  const { [visitId]: _, ...rest } = drafts
  drafts = rest
  persist()
}
