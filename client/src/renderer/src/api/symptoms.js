// Triệu chứng có cấu trúc (FR12, FR14): mỗi triệu chứng có một trạng thái PRESENT | ABSENT | UNKNOWN và nguồn
// (Form, Extracted, Prompt). Chỉ triệu chứng đã xác nhận mới được lưu và đưa vào luật / AI.
import { useEffect, useSyncExternalStore } from 'react'
import { apiGet } from './client'
import { fold } from '../utils/format'

export const STATES = [
  { key: 'PRESENT', label: 'Yes', short: 'Yes' },
  { key: 'ABSENT', label: 'No', short: 'No' },
  { key: 'UNKNOWN', label: 'Not sure', short: '?' }
]
export const SOURCES = { Form: 'Entered', Extracted: 'From description', Prompt: 'Asked (missing info)' }

// Đề xuất (triệu chứng lẫn sinh hiệu) gắn với lời kể đã gửi trích xuất: `from` = { text, textChanged }.
// Server báo text_changed hoặc lời kể trên form đã khác → kết quả cũ, không được xác nhận cho tới khi trích xuất lại.
export const extractionStale = (from, text) => !!from && (from.textChanged || from.text !== text)

// Danh mục đang dùng (GET /symptoms) — chỉ mã trong danh mục này mới gửi được lên server (mã lạ → 422 UNKNOWN_SYMPTOM).
let snapshot = { list: [], status: 'idle' } // idle | loading | ready | failed
const listeners = new Set()
function publish(next) {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((fn) => fn())
}

export async function loadSymptomCatalog() {
  if (snapshot.status === 'loading') return
  publish({ status: 'loading' })
  try {
    const rows = await apiGet('/api/v1/symptoms')
    publish({ list: rows.map((r) => ({ key: r.symptom_code, label: r.symptom_name, category: r.category })), status: 'ready' })
  } catch {
    publish({ status: 'failed' })
  }
}

// Theo danh mục đang dùng, không có thì là chính mã.
export const symptomName = (code) => snapshot.list.find((s) => s.key === code)?.label ?? code

export function useSymptomCatalog() {
  const s = useSyncExternalStore((fn) => (listeners.add(fn), () => listeners.delete(fn)), () => snapshot)
  useEffect(() => {
    if (s.status === 'idle') loadSymptomCatalog()
  }, [s.status])
  return { ...s, reload: loadSymptomCatalog }
}

// Nhóm hiển thị gom các category của OKF; dấu hiệu nguy hiểm lên đầu. Danh mục không có category → một nhóm.
// “Dấu hiệu nguy hiểm ngoài danh mục” (out_of_scope_symptom, category system_safety) đứng cuối nhóm nguy hiểm.
export const DANGER = 'danger'
export const OUT_OF_SCOPE = 'out_of_scope_symptom'
const GROUPS = [
  [DANGER, 'Warning signs', ['red_flag_sign', 'system_safety']],
  ['general', 'General symptoms', ['constitutional', 'infectious_sign']],
  ['respiratory', 'Respiratory', ['respiratory']],
  ['ent', 'Ear, nose & throat', ['ent']],
  ['eye', 'Eyes', ['ophthalmology']],
  ['neuro', 'Neurological', ['neurological']],
  ['gi', 'Digestive', ['gastrointestinal']],
  ['msk', 'Musculoskeletal', ['musculoskeletal']],
  ['skin', 'Skin', ['dermatologic']]
]
const GROUP_OF = Object.fromEntries(GROUPS.flatMap(([key, , cats]) => cats.map((c) => [c, key])))
export const isDangerSymptom = (s) => GROUP_OF[s?.category] === DANGER
export function groupSymptoms(list) {
  if (!list.some((s) => s.category)) return [{ key: '', label: '', items: list }]
  const groups = GROUPS.map(([key, label]) => ({ key, label, items: list.filter((s) => GROUP_OF[s.category] === key) }))
  const danger = groups[0].items
  groups[0].items = [...danger.filter((s) => s.key !== OUT_OF_SCOPE), ...danger.filter((s) => s.key === OUT_OF_SCOPE)]
  // Không có nhóm “Khác”; chỉ khi danh mục thêm category mới mà client chưa biết thì mới hiện, để y tá không mất mục nào.
  const rest = list.filter((s) => !GROUP_OF[s.category])
  return [...groups, { key: 'other', label: 'Other', items: rest }].filter((g) => g.items.length)
}

// So khớp không dấu: “dau bung” tìm ra “Đau bụng”.
export function searchSymptoms(list, query, limit = 8) {
  const q = fold(query)
  if (!q) return []
  const words = q.split(' ')
  return list.filter((s) => words.every((w) => fold(s.label).includes(w))).slice(0, limit)
}

// Bỏ UNKNOWN vì đó là mặc định.
export const toPayload = (map) =>
  Object.entries(map)
    .filter(([, x]) => x && x.state !== 'UNKNOWN')
    .map(([code, x]) => ({ symptom_code: code, state: x.state, source: x.source }))
