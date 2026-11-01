import { translate } from '../../../i18n'
import { todayISO } from '../../../api/inventoryStore'
import { exportCsv } from '../inventory/shared'
import { SCHEMAS } from './schemas'

export const csvValue = (schema, key, v) => {
  const f = schema.fields.find((x) => x.key === key)
  if (Array.isArray(v)) return v.join('; ')
  if (f?.type === 'select') return v ?? ''
  return v ?? ''
}

export function exportCatalog(key, rows) {
  const s = SCHEMAS[key]
  exportCsv(
    `danh-muc-${key}-${todayISO()}.csv`,
    [...s.csv.map((k) => s.fields.find((f) => f.key === k)?.label ?? k), 'Status'],
    rows.map((r) => [...s.csv.map((k) => csvValue(s, k, r[k])), translate(r.active ? 'In use' : 'Discontinued')])
  )
}
