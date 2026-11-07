import { useCallback, useEffect, useMemo, useState } from 'react'
import { translate } from '../../../i18n'
import { KINDS, OPEN_STATUSES, listAll, listReleases, listSources } from '../../../api/knowledgeApi'
import { LogicView } from './logic'

export const KIND_META = {
  symptoms: { label: 'Symptoms', one: 'Symptom', keyLabel: 'Symptom code' },
  conditions: { label: 'Conditions', one: 'Condition', keyLabel: 'Condition code' },
  relations: { label: 'Symptom–condition links', one: 'Symptom–condition link', keyLabel: 'Condition / symptom' },
  excerpts: { label: 'Guideline excerpts', one: 'Guideline excerpt', keyLabel: 'Excerpt key' },
  rules: { label: 'Triage rules', one: 'Triage rule', keyLabel: 'Rule key' }
}

export const STATUS_LABEL = { Active: 'In use', Draft: 'Draft', PendingApproval: 'Awaiting approval', Retired: 'Retired' }
const STATUS_TONE = { Active: 'ok', Draft: '', PendingApproval: 'info', Retired: 'muted' }
export const StatusBadge = ({ status }) => <span className={'badge ' + (STATUS_TONE[status] ?? '')}>{STATUS_LABEL[status] ?? status}</span>

export const RULE_TYPE_LABEL = { RED_FLAG: 'Red flag', PRIORITY_FLOOR: 'Priority floor' }
export const RuleTypeBadge = ({ type }) => <span className={'badge ' + (type === 'RED_FLAG' ? 'low' : 'warn')}>{RULE_TYPE_LABEL[type] ?? type}</span>


export function errorText(e) {
  const d = (e?.details ?? [])
    .map((x) => [x.field ?? x.path, x.message ?? x.msg].filter(Boolean).join(': '))
    .filter(Boolean)
  return [e?.message || translate('Something went wrong'), ...d].join(' — ')
}

// Dữ liệu nhỏ (vài trăm dòng) nên tải hết một lần.
export function useKnowledge() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const reload = useCallback(async () => {
    try {
      const [releases, sources, ...lists] = await Promise.all([listReleases(), listSources(), ...KINDS.map(listAll)])
      setData({ releases, sources, items: Object.fromEntries(KINDS.map((k, i) => [k, lists[i]])) })
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { data, error, reload }
}

export function groupByKey(rows) {
  const map = new Map()
  for (const r of rows) {
    const g = map.get(r.key) ?? { key: r.key, active: null, open: null, latest: null }
    if (r.status === 'Active') g.active = r
    if (OPEN_STATUSES.includes(r.status) && (!g.open || r.version > g.open.version)) g.open = r
    if (!g.latest || r.version > g.latest.version) g.latest = r
    map.set(r.key, g)
  }
  return [...map.values()]
}

// Ưu tiên bản nháp, sau đó bản đang dùng, rồi bản cũ.
export function useNames(items) {
  return useMemo(() => {
    const pick = (rows, field) => {
      const out = {}
      for (const g of groupByKey(rows ?? [])) out[g.key] = (g.open ?? g.active ?? g.latest)?.values?.[field] ?? g.key
      return out
    }
    return { symptom: pick(items?.symptoms, 'symptom_name'), condition: pick(items?.conditions, 'name_vi') }
  }, [items])
}

// Active hoặc đang soạn — đúng điều server kiểm (UNKNOWN_CODE).
export function usableCodes(rows) {
  return groupByKey(rows ?? [])
    .filter((g) => g.active || g.open)
    .map((g) => g.key)
    .sort()
}

export function Summary({ kind, values, names }) {
  const v = values ?? {}
  if (kind === 'symptoms')
    return (
      <span>
        <b>{v.symptom_name}</b> {v.category && <span className="ai-soft">· {v.category}</span>}
      </span>
    )
  if (kind === 'conditions')
    return (
      <span>
        <b>{v.name_vi}</b> {v.icd10_code && <span className="mono">· {v.icd10_code}</span>} {v.disease_group && <span className="ai-soft">· {v.disease_group}</span>}
      </span>
    )
  if (kind === 'relations')
    return (
      <span>
        <b>{names.condition[v.condition_code] ?? v.condition_code}</b> <span className="ai-soft">↔</span> {names.symptom[v.symptom_code] ?? v.symptom_code}{' '}
        <span className={'badge ' + (v.polarity === 'CONTRADICTS' ? 'low' : 'ok')}>{v.polarity === 'CONTRADICTS' ? 'Contradicts' : 'Supports'}</span>{' '}
        <span className="mono">{Number(v.weight).toFixed(2)}</span> {v.is_key && <span className="badge info">Key symptom</span>}
      </span>
    )
  if (kind === 'excerpts')
    return (
      <span>
        <b>{v.title}</b> <span className="ai-soft">· {names.condition[v.condition_code] ?? v.condition_code}</span>
      </span>
    )
  if (kind === 'rules')
    return (
      <span className="kb-rule-sum">
        <RuleTypeBadge type={v.rule_type} /> <b>{v.rule_name}</b>
        <span className="kb-rule-logic">
          <LogicView node={v.condition_logic} names={names} />
        </span>
      </span>
    )
  return null
}
