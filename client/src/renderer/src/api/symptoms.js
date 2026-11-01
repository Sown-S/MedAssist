// Triệu chứng có cấu trúc (FR12, FR14): mỗi triệu chứng có một trạng thái PRESENT | ABSENT | UNKNOWN và nguồn
// (Form, Extracted, Prompt). Chỉ triệu chứng đã xác nhận mới được lưu và đưa vào luật / AI.
import { useEffect, useSyncExternalStore } from 'react'
import { apiGet } from './client'

export const STATES = [
  { key: 'PRESENT', label: 'Yes', short: 'Yes' },
  { key: 'ABSENT', label: 'No', short: 'No' },
  { key: 'UNKNOWN', label: 'Not sure', short: '?' }
]
export const SOURCES = { Form: 'Entered', Extracted: 'From description', Prompt: 'Asked (missing info)' }

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

// Nhóm theo category của OKF, dấu hiệu nguy hiểm lên đầu; danh mục không có nhóm → một nhóm.
const GROUPS = [
  ['red_flag_sign', 'Warning signs'],
  ['constitutional', 'General symptoms'],
  ['respiratory_ent', 'Respiratory & ENT'],
  ['gastrointestinal', 'Digestive'],
  ['musculoskeletal', 'Musculoskeletal'],
  ['dermatologic', 'Skin']
]
export function groupSymptoms(list) {
  if (!list.some((s) => s.category)) return [{ key: '', label: '', items: list }]
  const known = new Set(GROUPS.map(([k]) => k))
  return [
    ...GROUPS.map(([key, label]) => ({ key, label, items: list.filter((s) => s.category === key) })),
    { key: 'other', label: 'Other', items: list.filter((s) => !known.has(s.category)) }
  ].filter((g) => g.items.length)
}

// Bỏ UNKNOWN vì đó là mặc định.
export const toPayload = (map) =>
  Object.entries(map)
    .filter(([, x]) => x && x.state !== 'UNKNOWN')
    .map(([code, x]) => ({ symptom_code: code, state: x.state, source: x.source }))
