// Bệnh Active trong bản tri thức (có ICD-10) cho ô chẩn đoán khi chạy với server; tải một lần mỗi phiên.
import { useEffect, useState } from 'react'
import { apiGet } from './client'

let cache = null
let loading = null

function loadConditions() {
  if (cache) return Promise.resolve(cache)
  loading ??= (async () => {
    const out = []
    for (let offset = 0; ; offset += 200) {
      const page = await apiGet(`/api/v1/admin/knowledge/conditions?status=Active&limit=200&offset=${offset}`)
      out.push(...page.items.map((x) => ({ code: x.values.icd10_code || '', label: x.values.name_vi, conditionCode: x.values.condition_code, sex: ['Female', 'Male'].includes(x.values.applicable_sex) ? x.values.applicable_sex : 'Any' })))
      if (out.length >= page.total || !page.items.length) break
    }
    cache = out.sort((a, b) => a.code.localeCompare(b.code))
    return cache
  })().finally(() => (loading = null))
  return loading
}

export const conditionOf = (name, icd) => cache?.find((c) => c.label === name && (!icd || c.code === icd)) ?? null

// “J03.9 — Viêm amidan cấp” → { icd: 'J03.9', name }; chữ tự do (vd gợi ý AI không có mã ICD) → { icd: null, name }.
export function parseDiagnosis(text) {
  const t = String(text ?? '').trim()
  const m = t.match(/^([A-Z]\d{2}(?:\.[0-9A-Z]{1,4})?)\s*[—–-]\s*(.+)$/i)
  return m ? { icd: m[1].toUpperCase(), name: m[2].trim() } : { icd: null, name: t }
}
// Bệnh trong danh mục ứng với chữ chẩn đoán (theo tên + mã ICD nếu có) — để biết condition_code / giới tính áp dụng.
export const conditionOfText = (text) => {
  const { icd, name } = parseDiagnosis(text)
  return name ? conditionOf(name, icd) : null
}

export function useConditions(enabled) {
  const [list, setList] = useState(cache ?? [])
  useEffect(() => {
    if (!enabled || cache) return
    let alive = true
    loadConditions().then((x) => alive && setList(x), () => {})
    return () => {
      alive = false
    }
  }, [enabled])
  return list
}
