import { useEffect, useMemo, useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import Icon from '../../../components/Icon'
import { useToast } from '../../../context/ToastContext'
import { saveDraft, pickRuleData } from '../../../api/aiConfigStore'
import { RULE_TYPES, SYMPTOMS, VITALS, OPS, ICD10, vitalOf, fmtWeight } from './catalog'
import { findIssues } from './ruleEngine'
import { CondChips, IcdCell, TypeBadge } from './ui'

const BLANK = {
  type: 'dx',
  cond: { symptoms: [], absent: [], ageMin: null, ageMax: null, minDays: null, vitals: [] },
  icd: '',
  weight: 0.7,
  rationale: '',
  reference: '',
  enabled: true,
  retired: false
}

const str = (v) => (v == null ? '' : String(v))
const numOrNull = (s) => (String(s).trim() === '' ? null : Number(String(s).replace(',', '.')))

function toForm(d) {
  return {
    type: d.type,
    present: [...d.cond.symptoms],
    absent: [...(d.cond.absent ?? [])],
    ageMin: str(d.cond.ageMin),
    ageMax: str(d.cond.ageMax),
    minDays: str(d.cond.minDays),
    vitals: (d.cond.vitals ?? []).map((v) => ({ ...v, value: str(v.value) })),
    icd: d.icd ?? '',
    weight: fmtWeight(d.weight),
    rationale: d.rationale ?? '',
    reference: d.reference ?? '',
    enabled: d.enabled,
    retired: d.retired
  }
}
function toData(f) {
  return {
    type: f.type,
    cond: {
      symptoms: f.present,
      absent: f.absent,
      ageMin: numOrNull(f.ageMin),
      ageMax: numOrNull(f.ageMax),
      minDays: numOrNull(f.minDays),
      vitals: f.vitals.map((v) => ({ key: v.key, op: v.op, value: numOrNull(v.value) }))
    },
    icd: f.icd,
    weight: numOrNull(f.weight),
    rationale: f.rationale.trim(),
    reference: f.reference.trim(),
    enabled: f.enabled,
    retired: f.retired
  }
}

function validate(f, d) {
  const e = []
  if (!f.present.length && !f.vitals.length) e.push('Add at least one symptom or vital-sign threshold.')
  if ([f.ageMin, f.ageMax, f.minDays].some((x) => x.trim() !== '' && !(Number(x.replace(',', '.')) >= 0)))
    e.push('Age and duration must be non-negative numbers.')
  if (d.cond.ageMin != null && d.cond.ageMax != null && d.cond.ageMin > d.cond.ageMax) e.push('Minimum age is greater than maximum age.')
  if (d.cond.vitals.some((v) => v.value == null || !Number.isFinite(v.value))) e.push('Every vital-sign threshold needs a numeric value.')
  if (d.cond.vitals.some((v) => Number.isFinite(v.value) && (v.value < vitalOf(v.key).min || v.value > vitalOf(v.key).max)))
    e.push('A vital-sign threshold is outside the physiological range.')
  if (!f.icd) e.push('Choose the ICD-10 code for the result.')
  if (!(d.weight >= 0 && d.weight <= 1)) e.push('Weight must be between 0.00 and 1.00.')
  if (f.rationale.trim().length < 15) e.push('Write the rationale (at least 15 characters) — suggestions must be explainable.')
  if (!f.reference.trim()) e.push('Enter the reference source (guideline, protocol…).')
  return e
}

const ISSUE_TEXT = {
  duplicate: 'Duplicate of',
  conflict: 'Contradicts',
  overlap: 'Always fires together with'
}

export default function RuleFormModal({ open, rule, rules, user, onClose }) {
  const { showToast } = useToast()
  const base = rule ? (rule.pending ? rule.pending.data : pickRuleData(rule)) : BLANK
  const [f, setF] = useState(() => toForm(base))
  const [note, setNote] = useState('')
  const [step, setStep] = useState('edit') // edit → confirm
  const [submit, setSubmit] = useState(false)
  const [ack, setAck] = useState(false)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open) return
    setF(toForm(base))
    setNote('')
    setStep('edit')
    setAck(false)
    setTried(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule?.id])

  const data = useMemo(() => toData(f), [f])
  const errors = validate(f, data)
  if (rule && note.trim().length < 5) errors.push('Write a reason for the change (at least 5 characters).')
  const hasCond = f.present.length > 0 || f.vitals.length > 0
  const issues = useMemo(
    () => (hasCond ? findIssues({ id: rule?.id ?? '__new', ...data }, rules) : []),
    [hasCond, data, rules, rule?.id]
  )
  const serious = issues.filter((i) => i.kind !== 'overlap')

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  // Mỗi chip triệu chứng xoay vòng: không dùng → bắt buộc có → bắt buộc KHÔNG có.
  function cycle(key) {
    setF((x) => {
      if (x.present.includes(key)) return { ...x, present: x.present.filter((k) => k !== key), absent: [...x.absent, key] }
      if (x.absent.includes(key)) return { ...x, absent: x.absent.filter((k) => k !== key) }
      return { ...x, present: [...x.present, key] }
    })
  }
  const setVital = (i, patch) => set('vitals', f.vitals.map((v, j) => (j === i ? { ...v, ...patch } : v)))

  function tryNext(asSubmit) {
    setTried(true)
    if (errors.length) return
    setSubmit(asSubmit)
    setStep('confirm')
  }
  function save() {
    const id = saveDraft(rule?.id ?? null, data, note.trim() || 'New rule', user, { submit })
    showToast(submit ? 'Submitted for doctor review' : 'Draft saved — not applied yet')
    onClose(id)
  }

  return (
    <Modal open={open} onClose={() => onClose()} wide>
      <ModalHeader title={rule ? 'Edit rule' : 'Add rule'} onClose={() => onClose()} />
      {step === 'edit' ? (
        <div className="modal-body ai-form">
          {rule && (
            <div className="ai-form-id">
              <b className="mono">{rule.id}</b> <span>Current version</span> <span className="mono">v{rule.version}</span>
            </div>
          )}

          <div className="ai-form-sec">
            <div className="section-label">1. Rule type</div>
            <div className="ai-seg">
              {RULE_TYPES.map((t) => (
                <button key={t.key} type="button" className={f.type === t.key ? 'active' : ''} onClick={() => set('type', t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ai-form-sec">
            <div className="section-label">2. Conditions (If)</div>
            <div className="ai-hint">
              <span>Click a symptom to cycle:</span>
              <span className="ai-sym on">
                <Icon name="check" />
                <span>Must have</span>
              </span>
              <span className="ai-sym neg">
                <Icon name="x" />
                <span>Must NOT have</span>
              </span>
              <span className="ai-sym">
                <span>Not used</span>
              </span>
            </div>
            <div className="ai-sym-picker">
              {SYMPTOMS.map((s) => {
                const st = f.present.includes(s.key) ? ' on' : f.absent.includes(s.key) ? ' neg' : ''
                return (
                  <button key={s.key} type="button" className={'ai-sym' + st} onClick={() => cycle(s.key)}>
                    {st === ' on' && <Icon name="check" />}
                    {st === ' neg' && <Icon name="x" />}
                    <span>{s.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="ai-grid3" style={{ marginTop: 12 }}>
              <div className="field">
                <label>Minimum age (years)</label>
                <input type="number" min="0" value={f.ageMin} onChange={(e) => set('ageMin', e.target.value)} placeholder="Any" />
              </div>
              <div className="field">
                <label>Maximum age (years)</label>
                <input type="number" min="0" value={f.ageMax} onChange={(e) => set('ageMax', e.target.value)} placeholder="Any" />
              </div>
              <div className="field">
                <label>Symptoms lasting at least (days)</label>
                <input type="number" min="0" value={f.minDays} onChange={(e) => set('minDays', e.target.value)} placeholder="Any" />
              </div>
            </div>

            <div className="ai-vitals">
              {f.vitals.map((v, i) => (
                <div className="ai-vital-row" key={i}>
                  <select value={v.key} onChange={(e) => setVital(i, { key: e.target.value })}>
                    {VITALS.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                  <select value={v.op} onChange={(e) => setVital(i, { op: e.target.value })}>
                    {OPS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step={vitalOf(v.key).step}
                    value={v.value}
                    onChange={(e) => setVital(i, { value: e.target.value })}
                  />
                  <span className="ai-unit">{vitalOf(v.key).unit}</span>
                  <button type="button" className="btn btn-ghost btn-sm" title="Remove" onClick={() => set('vitals', f.vitals.filter((_, j) => j !== i))}>
                    <Icon name="trash" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => set('vitals', [...f.vitals, { key: 'temp', op: '>=', value: '' }])}
              >
                + Add vital-sign threshold
              </button>
            </div>
          </div>

          <div className="ai-form-sec">
            <div className="section-label">3. Result (Then)</div>
            <div className="ai-grid2">
              <div className="field">
                <label>
                  ICD-10 code <span className="ai-req">*</span>
                </label>
                <select value={f.icd} onChange={(e) => set('icd', e.target.value)}>
                  <option value="">— Choose an ICD-10 code —</option>
                  {ICD10.map((i) => (
                    <option key={i.code} value={i.code}>
                      {i.code + ' · '}
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Weight (0.00 – 1.00)</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={f.weight}
                  onChange={(e) => set('weight', e.target.value)}
                  onBlur={() => Number.isFinite(data.weight) && set('weight', fmtWeight(data.weight))}
                />
              </div>
            </div>
          </div>

          <div className="ai-form-sec">
            <div className="section-label">4. Rationale &amp; evidence</div>
            <div className="field">
              <label>
                Rationale (shown to the doctor with the suggestion) <span className="ai-req">*</span>
              </label>
              <textarea
                rows={3}
                value={f.rationale}
                onChange={(e) => set('rationale', e.target.value)}
                placeholder="Why do these conditions lead to this result?"
              />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>
                Reference source <span className="ai-req">*</span>
              </label>
              <input
                value={f.reference}
                onChange={(e) => set('reference', e.target.value)}
                placeholder="e.g. Ministry of Health protocol, clinical guideline, year"
              />
            </div>
            {rule && (
              <div className="field" style={{ marginTop: 10 }}>
                <label>
                  Reason for this change <span className="ai-req">*</span>
                </label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recorded in the change log" />
              </div>
            )}
          </div>

          <div className="ai-preview">
            <div className="label">Preview</div>
            <div className="ai-preview-line">
              <b>IF</b> <CondChips cond={data.cond} /> <b>THEN</b> <TypeBadge type={data.type} /> <IcdCell code={data.icd} />{' '}
              <span className="mono">({fmtWeight(data.weight)})</span>
            </div>
          </div>

          {issues.length > 0 && (
            <div className={'warn-banner show ' + (serious.length ? 'danger' : 'caution')}>
              <div className="icon">
                <Icon name="alert" />
              </div>
              <div className="txt">
                <b>Possible duplicate or contradiction</b>
                {issues.map((i) => (
                  <div key={i.with.id}>
                    <span>{ISSUE_TEXT[i.kind]}</span> <b className="mono ai-inline">{i.with.id}</b> <IcdCell code={i.with.icd} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tried && errors.length > 0 && (
            <div className="warn-banner show danger">
              <div className="icon">
                <Icon name="ban" />
              </div>
              <div className="txt">
                <b>Please fix the following</b>
                {errors.map((e) => (
                  <div key={e}>{e}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="modal-body">
          <div className="warn-banner show caution">
            <div className="icon">
              <Icon name="alert" />
            </div>
            <div className="txt">
              <b>This is a clinical rule</b>
              The change is saved as a draft and does NOT affect patients until a doctor approves it in the review queue.
            </div>
          </div>
          <div className="ai-preview" style={{ marginTop: 12 }}>
            <div className="ai-preview-line">
              <b>IF</b> <CondChips cond={data.cond} /> <b>THEN</b> <TypeBadge type={data.type} /> <IcdCell code={data.icd} />{' '}
              <span className="mono">({fmtWeight(data.weight)})</span>
            </div>
          </div>
          {serious.length > 0 && (
            <label className="ai-ack">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>I have reviewed the duplicate/contradiction warnings and still want to save.</span>
            </label>
          )}
        </div>
      )}
      <div className="modal-foot">
        {step === 'edit' ? (
          <>
            <button className="btn btn-ghost" onClick={() => onClose()}>
              Cancel
            </button>
            <button className="btn btn-ghost" onClick={() => tryNext(false)}>
              Save draft
            </button>
            <button className="btn btn-primary" onClick={() => tryNext(true)}>
              Save &amp; submit for review
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => setStep('edit')}>
              Back
            </button>
            <button className="btn btn-primary" disabled={serious.length > 0 && !ack} onClick={save}>
              {submit ? 'Confirm & submit for review' : 'Confirm & save draft'}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
