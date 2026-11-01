// Bệnh Active trong bản tri thức (có ICD-10) cho ô chẩn đoán khi chạy với server; tải một lần mỗi phiên.
import { useEffect, useState } from 'react'
import { apiGet } from './client'

let cache = null
let loading = null

export function loadConditions() {
  if (cache) return Promise.resolve(cache)
  loading ??= (async () => {
    const out = []
    for (let offset = 0; ; offset += 200) {
      const page = await apiGet(`/api/v1/admin/knowledge/conditions?status=Active&limit=200&offset=${offset}`)
      out.push(...page.items.map((x) => ({ code: x.values.icd10_code || '', label: x.values.name_vi, conditionCode: x.values.condition_code })))
      if (out.length >= page.total || !page.items.length) break
    }
    cache = out.sort((a, b) => a.code.localeCompare(b.code))
    return cache
  })().finally(() => (loading = null))
  return loading
}

export const conditionOf = (name, icd) => cache?.find((c) => c.label === name && (!icd || c.code === icd)) ?? null

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
