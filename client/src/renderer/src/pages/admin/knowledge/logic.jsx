import { translate } from '../../../i18n'
import { VITAL_KEYS, vitalDef } from '../../../api/vitals'

// condition_logic: nhóm { op: 'AND' | 'OR', args }; lá: symptom { symptom_code, state } | vital { vital, cmp, value }
// | age { unit, cmp, value }.
export const CMPS = ['<', '<=', '>', '>=', '==']
const CMP_TEXT = { '<': '<', '<=': '≤', '>': '>', '>=': '≥', '==': '=' }
export const MAX_DEPTH = 5

export function LogicView({ node, names, depth = 0 }) {
  if (!node) return <span className="ai-soft">—</span>
  if (node.op) {
    return (
      <span className="kb-logic-group">
        <span className="kb-logic-op">{node.op === 'AND' ? 'All of' : 'Any of'}</span>
        <span className="kb-logic-args">
          {(node.args ?? []).map((a, i) => (
            <LogicView key={i} node={a} names={names} depth={depth + 1} />
          ))}
        </span>
      </span>
    )
  }
  if (node.type === 'symptom')
    return (
      <span className={'ai-chip' + (node.state === 'ABSENT' ? ' neg' : '')}>
        {node.state === 'ABSENT' && <span>No</span>} <span>{names?.symptom?.[node.symptom_code] ?? node.symptom_code}</span>
      </span>
    )
  if (node.type === 'vital') {
    const d = vitalDef(node.vital)
    return (
      <span className="ai-chip vital">
        <span>{d?.label ?? node.vital}</span>{' '}
        <span className="mono">
          {CMP_TEXT[node.cmp] ?? node.cmp} {node.value} {d?.unit}
        </span>
      </span>
    )
  }
  if (node.type === 'age')
    return (
      <span className="ai-chip meta">
        <span>Age</span>{' '}
        <span className="mono">
          {CMP_TEXT[node.cmp] ?? node.cmp} {node.value}
        </span>{' '}
        <span>{node.unit === 'months' ? 'months' : 'years'}</span>
      </span>
    )
  return <span className="mono ai-small">{JSON.stringify(node)}</span>
}

export const newLeaf = (type, symptoms) =>
  type === 'symptom'
    ? { type: 'symptom', symptom_code: symptoms?.[0] ?? '', state: 'PRESENT' }
    : type === 'vital'
      ? { type: 'vital', vital: VITAL_KEYS[0].key, cmp: '>=', value: '' }
      : type === 'age'
        ? { type: 'age', unit: 'years', cmp: '<', value: '' }
        : { op: 'AND', args: [] }

// Kiểm tra sơ bộ trước khi gửi (server kiểm lại đầy đủ). Trả lỗi đầu tiên hoặc null.
export function logicProblem(node, depth = 1) {
  if (depth > MAX_DEPTH) return translate('Too many nested groups')
  if (node.op) {
    if (!node.args?.length) return translate('A group must contain at least one condition')
    for (const a of node.args) {
      const p = logicProblem(a, depth + 1)
      if (p) return p
    }
    return null
  }
  if (node.type === 'symptom') return node.symptom_code ? null : translate('Choose a symptom')
  return node.value === '' || !Number.isFinite(Number(node.value)) ? translate('Enter a number') : null
}

// Ô số lưu chuỗi khi đang gõ; gửi lên server thì đổi thành số.
export function cleanLogic(node) {
  if (node.op) return { op: node.op, args: node.args.map(cleanLogic) }
  if (node.type === 'symptom') return { type: 'symptom', symptom_code: node.symptom_code, state: node.state }
  return node.type === 'vital'
    ? { type: 'vital', vital: node.vital, cmp: node.cmp, value: Number(node.value) }
    : { type: 'age', unit: node.unit, cmp: node.cmp, value: Number(node.value) }
}

export function LogicEditor({ node, onChange, onRemove, symptoms, names, depth = 1 }) {
  if (node.op) {
    const setArg = (i, v) => onChange({ ...node, args: node.args.map((a, j) => (j === i ? v : a)) })
    const add = (type) => onChange({ ...node, args: [...node.args, newLeaf(type, symptoms)] })
    return (
      <div className="kb-logic-edit-group">
        <div className="kb-logic-edit-head">
          <select className="ai-select" value={node.op} onChange={(e) => onChange({ ...node, op: e.target.value })}>
            <option value="AND">All of these (AND)</option>
            <option value="OR">Any of these (OR)</option>
          </select>
          {onRemove && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>
              Remove group
            </button>
          )}
        </div>
        {node.args.map((a, i) => (
          <LogicEditor
            key={i}
            node={a}
            depth={depth + 1}
            symptoms={symptoms}
            names={names}
            onChange={(v) => setArg(i, v)}
            onRemove={() => onChange({ ...node, args: node.args.filter((_, j) => j !== i) })}
          />
        ))}
        {!node.args.length && <p className="ai-small ai-soft">Add at least one condition.</p>}
        <div className="kb-logic-add">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => add('symptom')}>
            + Symptom
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => add('vital')}>
            + Vital sign
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => add('age')}>
            + Age
          </button>
          {depth < MAX_DEPTH && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => add('group')}>
              + Group
            </button>
          )}
        </div>
      </div>
    )
  }
  const set = (patch) => onChange({ ...node, ...patch })
  return (
    <div className="kb-logic-edit-leaf">
      {node.type === 'symptom' && (
        <>
          <select className="ai-select" value={node.state} onChange={(e) => set({ state: e.target.value })}>
            <option value="PRESENT">Has</option>
            <option value="ABSENT">Does not have</option>
          </select>
          <select className="ai-select kb-grow" value={node.symptom_code} onChange={(e) => set({ symptom_code: e.target.value })}>
            <option value="">— Choose a symptom —</option>
            {symptoms.map((c) => (
              <option key={c} value={c}>
                {names.symptom[c] ?? c}
              </option>
            ))}
          </select>
        </>
      )}
      {node.type === 'vital' && (
        <>
          <select className="ai-select kb-grow" value={node.vital} onChange={(e) => set({ vital: e.target.value })}>
            {VITAL_KEYS.map((v) => (
              <option key={v.key} value={v.key}>
                {translate(v.label)} ({v.unit})
              </option>
            ))}
          </select>
          <CmpSelect value={node.cmp} onChange={(cmp) => set({ cmp })} />
          <input className="kb-num" type="number" step="any" value={node.value} onChange={(e) => set({ value: e.target.value })} />
        </>
      )}
      {node.type === 'age' && (
        <>
          <span className="ai-small">Age</span>
          <CmpSelect value={node.cmp} onChange={(cmp) => set({ cmp })} />
          <input className="kb-num" type="number" step="any" value={node.value} onChange={(e) => set({ value: e.target.value })} />
          <select className="ai-select" value={node.unit} onChange={(e) => set({ unit: e.target.value })}>
            <option value="years">years</option>
            <option value="months">months</option>
          </select>
        </>
      )}
      {onRemove && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove} title="Remove this condition">
          ✕
        </button>
      )}
    </div>
  )
}

function CmpSelect({ value, onChange }) {
  return (
    <select className="ai-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {CMPS.map((c) => (
        <option key={c} value={c}>
          {CMP_TEXT[c]}
        </option>
      ))}
    </select>
  )
}
