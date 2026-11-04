// Phiếu khám đang viết dở, lưu trên máy để tắt app hay app treo không mất. Chỉ giữ trong ngày, chỉ cho người viết:
// - bác sĩ bấm Đăng xuất (đã xong mọi ca) → xoá;
// - người khác đăng nhập trên máy này → xoá;
// - sang ngày mới (mở app, hoặc app để mở qua đêm) → xoá hẳn khỏi đĩa.
// Tự đăng xuất khi không thao tác / hết phiên thì giữ, để bác sĩ đăng nhập lại là khám tiếp.

const KEY = 'medassist_consult_drafts_v1'
const today = () => new Date().toLocaleDateString('sv-SE') // yyyy-mm-dd theo giờ máy

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
function wipeDisk() {
  try {
    localStorage.removeItem(KEY)
  } catch {/* không truy cập được thì thôi */}
}

let day = today()
let owner = null
let drafts = {}
let timer = null
function load() {
  const saved = read()
  if (saved?.day === today()) {
    owner = saved.owner ?? null
    drafts = saved.drafts ?? {}
  } else if (saved) wipeDisk() // bản của ngày trước: xoá ngay, không đợi lần ghi sau
}
load()

// App để mở qua đêm: bản trong bộ nhớ là của hôm qua → bỏ, không ghi lại với ngày hôm nay.
function rollDay() {
  if (day === today()) return
  day = today()
  drafts = {}
  clearTimeout(timer)
  wipeDisk()
}

// Gõ phím nào cũng lưu thì nặng → gom lại, ghi sau 400 ms.
function persist() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      if (Object.keys(drafts).length) localStorage.setItem(KEY, JSON.stringify({ day, owner, drafts }))
      else wipeDisk()
    } catch {/* không lưu được thì chỉ giữ trong phiên */}
  }, 400)
}

export function getDraft(visitId) {
  rollDay()
  return drafts[visitId]
}
export function saveDraft(visitId, d) {
  rollDay()
  drafts = { ...drafts, [visitId]: d }
  persist()
}
export function deleteDraft(visitId) {
  if (!(visitId in drafts)) return
  const { [visitId]: _, ...rest } = drafts
  drafts = rest
  persist()
}

// Đăng nhập: bản nháp của người khác trên máy này bị xoá; bản của chính mình (vừa bị tự đăng xuất) thì giữ.
export function claimDrafts(userId) {
  rollDay()
  if (owner && owner !== userId) clearDrafts()
  owner = userId
  if (Object.keys(drafts).length) persist()
}
// Đăng xuất chủ động: xoá hết, cả trên đĩa.
export function clearDrafts() {
  clearTimeout(timer)
  drafts = {}
  owner = null
  wipeDisk()
}
export const hasDrafts = () => Object.keys(drafts).length > 0
