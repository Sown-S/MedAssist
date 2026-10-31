// Phiếu khám đang viết dở, lưu trên máy để tắt app hay app treo không mất. Chỉ giữ trong ngày; phiếu dở của ngày cũ
// được đính kèm vào lượt khám khi lưu trữ (staleDraft). Không ghi nhật ký vì chưa phải dữ liệu chính thức.
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
const stale = saved?.day && saved.day !== today() ? saved.drafts ?? {} : {}
export const staleDraft = (visitId) => stale[visitId]
let timer = null
// Gõ phím nào cũng lưu thì nặng → gom lại, ghi sau 400 ms.
function persist() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ day: today(), drafts }))
    } catch {/* không lưu được thì chỉ giữ trong phiên */}
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
