import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import { translate } from '../../../i18n'
import { putDraft, RULE_PREFIX } from '../../../api/knowledgeApi'
import { KIND_META, errorText, usableCodes } from './shared'
import { LogicEditor, LogicView } from './logic'
import { initial, bodyOf, problem } from './itemForm'

// group = null: thêm mới. Lưu = tạo / cập nhật bản nháp trong bản phát hành đang mở.
export default function ItemFormModal({ open, kind, group, data, names, onClose, onSaved }) {
  const creating = !group
  const base = group ? (group.open ?? group.active ?? group.latest) : null
  const [key, setKey] = useState('')
  const [f, setF] = useState(() => initial(kind, base, data.sources))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setKey(group?.key ?? (kind === 'rules' ? 'rf_' : ''))
    setF(initial(kind, base, data.sources))
    setErr('')
  }, [open, kind, group]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const symptoms = usableCodes(data.items.symptoms)
  const conditions = usableCodes(data.items.conditions)
  const sources = data.sources.filter((s) => s.is_active)

  async function save() {
    const p = problem(kind, key, f, creating)
    if (p) return setErr(p)
    const k = kind === 'relations' ? (creating ? `${f.condition_code}/${f.symptom_code}` : group.key) : key
    setBusy(true)
    setErr('')
    try {
      await putDraft(kind, k, bodyOf(kind, f))
      onSaved()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const sourceField = (
    <div className="field full">
      <label>Source</label>
      <select value={f.source_id} onChange={(e) => set({ source_id: e.target.value })}>
        <option value="">— Choose a source —</option>
        {sources.map((s) => (
          <option key={s.source_id} value={s.source_id}>
            {s.organization} · {s.title}
            {s.edition ? ' (' + s.edition + ')' : ''}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate(creating ? 'New' : 'Edit') + ' · ' + translate(KIND_META[kind].one)} onClose={onClose} />
      <div className="modal-body">
        <div className="form-grid cols-2">
          {kind !== 'relations' && (
            <div className="field full">
              <label>{KIND_META[kind].keyLabel}</label>
              <input className="mono" value={key} disabled={!creating} onChange={(e) => setKey(e.target.value.trim().toLowerCase())} placeholder="vd: sot_cao" />
              {creating && <small className="ai-soft">Lowercase letters without accents, digits and underscores; cannot be changed later.</small>}
            </div>
          )}

          {kind === 'symptoms' && (
            <>
              <div className="field">
                <label>Symptom name</label>
                <input value={f.symptom_name} onChange={(e) => set({ symptom_name: e.target.value })} />
              </div>
              <div className="field">
                <label>Group (optional)</label>
                <input value={f.category} onChange={(e) => set({ category: e.target.value })} />
              </div>
            </>
          )}

          {kind === 'conditions' && (
            <>
              <div className="field full">
                <label>Condition name (Vietnamese)</label>
                <input value={f.name_vi} onChange={(e) => set({ name_vi: e.target.value })} />
              </div>
              <div className="field">
                <label>ICD-10 code</label>
                <input className="mono" value={f.icd10_code} onChange={(e) => set({ icd10_code: e.target.value })} />
              </div>
              <div className="field">
                <label>Disease group</label>
                <input value={f.disease_group} onChange={(e) => set({ disease_group: e.target.value })} />
              </div>
              <div className="field full">
                <label>Description (optional)</label>
                <textarea rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} />
              </div>
            </>
          )}

          {kind === 'relations' && (
            <>
              <div className="field">
                <label>Condition</label>
                <select value={f.condition_code} disabled={!creating} onChange={(e) => set({ condition_code: e.target.value })}>
                  <option value="">— Choose —</option>
                  {conditions.map((c) => (
                    <option key={c} value={c}>
                      {names.condition[c] ?? c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Symptom</label>
                <select value={f.symptom_code} disabled={!creating} onChange={(e) => set({ symptom_code: e.target.value })}>
                  <option value="">— Choose —</option>
                  {symptoms.map((c) => (
                    <option key={c} value={c}>
                      {names.symptom[c] ?? c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Direction</label>
                <select value={f.polarity} onChange={(e) => set({ polarity: e.target.value })}>
                  <option value="SUPPORTS">Supports the condition</option>
                  <option value="CONTRADICTS">Contradicts the condition</option>
                </select>
              </div>
              <div className="field">
                <label>Weight (0 – 1)</label>
                <input type="number" min="0" max="1" step="0.05" value={f.weight} onChange={(e) => set({ weight: e.target.value })} />
              </div>
              <label className="field full kb-check">
                <input type="checkbox" checked={f.is_key} onChange={(e) => set({ is_key: e.target.checked })} /> <span>Key symptom (asked about when still unknown)</span>
              </label>
              {sourceField}
            </>
          )}

          {kind === 'excerpts' && (
            <>
              <div className="field full">
                <label>Condition</label>
                <select value={f.condition_code} onChange={(e) => set({ condition_code: e.target.value })}>
                  <option value="">— Choose —</option>
                  {conditions.map((c) => (
                    <option key={c} value={c}>
                      {names.condition[c] ?? c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field full">
                <label>Title</label>
                <input value={f.title} onChange={(e) => set({ title: e.target.value })} />
              </div>
              <div className="field full">
                <label>Content (rephrased, not copied verbatim)</label>
                <textarea rows={5} value={f.content} onChange={(e) => set({ content: e.target.value })} />
              </div>
              {sourceField}
              <div className="field full">
                <label>Location in the source (optional)</label>
                <input value={f.source_locator} onChange={(e) => set({ source_locator: e.target.value })} placeholder="vd: Mục 3.2, tr. 14" />
              </div>
            </>
          )}

          {kind === 'rules' && (
            <>
              <div className="field">
                <label>Rule type</label>
                <select
                  value={f.rule_type}
                  disabled={!creating}
                  onChange={(e) => {
                    const t = e.target.value
                    set({ rule_type: t })
                    setKey((k) => RULE_PREFIX[t] + k.replace(/^(rf_|pf_)/, ''))
                  }}
                >
                  <option value="RED_FLAG">Red flag — Emergency, skips the AI</option>
                  <option value="PRIORITY_FLOOR">Priority floor — at least High priority</option>
                </select>
              </div>
              <div className="field">
                <label>Rule name</label>
                <input value={f.rule_name} onChange={(e) => set({ rule_name: e.target.value })} />
              </div>
              <div className="field full">
                <label>Reason shown to doctors (one short sentence)</label>
                <input value={f.reason_text} onChange={(e) => set({ reason_text: e.target.value })} />
              </div>
              <div className="field full">
                <label>Condition (when this rule applies)</label>
                <LogicEditor
                  node={f.condition_logic.op ? f.condition_logic : { op: 'AND', args: [f.condition_logic] }}
                  symptoms={symptoms}
                  names={names}
                  onChange={(v) => set({ condition_logic: v })}
                />
                <div className="kb-logic-preview">
                  <span className="ai-small ai-soft">Preview:</span> <LogicView node={f.condition_logic} names={names} />
                </div>
              </div>
              {sourceField}
            </>
          )}
        </div>
        {!sources.length && ['relations', 'excerpts', 'rules'].includes(kind) && (
          <p className="ai-small sp-warn">No active source yet — add one in the Sources tab first.</p>
        )}
        {err && <div className="kb-error">{err}</div>}
        <p className="ai-foot-note">Saved as a draft in the open release. It is only used after a doctor approves the release.</p>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save draft'}
        </button>
      </div>
    </Modal>
  )
}
