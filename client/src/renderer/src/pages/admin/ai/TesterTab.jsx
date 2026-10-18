import { useMemo, useState } from 'react'
import Icon from '../../../components/Icon'
import { SYMPTOMS, VITALS, symptomLabel, vitalOf, opLabel, fmtWeight } from './catalog'
import { evaluateCase, extractCase, allIssues } from './ruleEngine'
import { TypeBadge, IcdCell, Empty } from './ui'

const BLANK = { age: '', days: '', symptoms: [], vitals: { temp: '', hr: '', rr: '', spo2: '', sbp: '' } }
const num = (s) => (String(s).trim() === '' ? null : Number(String(s).replace(',', '.')))

const SAMPLES = [
  'Bé trai 4 tuổi sốt 39,6 độ, sổ mũi, đau họng 2 ngày nay',
  'Nam 58 tuổi đau ngực, khó thở từ sáng, SpO2 93',
  'Nữ 32 tuổi ho khan kéo dài 4 tuần, không sốt'
]

export default function TesterTab({ rules, settings, synonyms, required }) {
  const [c, setC] = useState(BLANK)
  const [text, setText] = useState('')
  const [extracted, setExtracted] = useState(null)
  const [includeDrafts, setIncludeDrafts] = useState(false)

  const kase = useMemo(
    () => ({
      age: num(c.age),
      days: num(c.days),
      symptoms: new Set(c.symptoms),
      vitals: Object.fromEntries(Object.entries(c.vitals).map(([k, v]) => [k, num(v)]))
    }),
    [c]
  )
  const empty = !c.symptoms.length && Object.values(c.vitals).every((v) => v === '')
  const res = useMemo(() => evaluateCase(rules, kase, settings, { includeDrafts }), [rules, kase, settings, includeDrafts])

  // Hai quy tắc cùng kích hoạt mà đang trùng / mâu thuẫn nhau.
  const clashes = useMemo(() => {
    const ids = new Set([...res.alerts, ...res.dxShown, ...res.dxHidden].map((f) => f.rule.id))
    return allIssues(rules).filter((i) => ids.has(i.rule.id) && ids.has(i.with.id) && i.kind !== 'overlap')
  }, [res, rules])

  const missingFields = required.filter((f) => f.required && ['age', 'days', 'temp', 'spo2'].includes(f.key)).filter((f) => {
    if (f.key === 'age') return c.age === ''
    if (f.key === 'days') return c.days === ''
    return c.vitals[f.key] === ''
  })

  function toggleSym(k) {
    setC((x) => ({ ...x, symptoms: x.symptoms.includes(k) ? x.symptoms.filter((s) => s !== k) : [...x.symptoms, k] }))
  }
  function runExtract(t = text) {
    const out = extractCase(t, synonyms)
    setExtracted(out)
    setC({
      age: out.age != null ? String(out.age) : '',
      days: out.days != null ? String(out.days) : '',
      symptoms: [...out.symptoms],
      vitals: { ...BLANK.vitals, temp: out.vitals.temp != null ? String(out.vitals.temp) : '', spo2: out.vitals.spo2 != null ? String(out.vitals.spo2) : '' }
    })
  }

  return (
    <div className="ai-tester">
      <div className="ai-tester-input">
        <div className="section-label" style={{ marginTop: 0 }}>
          Free-text complaint (Vietnamese)
        </div>
        <textarea
          className="ai-textarea"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Bé 4 tuổi sốt 39,5 độ, ho có đờm 3 ngày"
        />
        <div className="ai-samples">
          {SAMPLES.map((s) => (
            <button
              key={s}
              className="ai-sample"
              onClick={() => {
                setText(s)
                runExtract(s)
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" disabled={!text.trim()} onClick={() => runExtract()}>
          <Icon name="zap" /> <span>Extract into structured fields</span>
        </button>
        {extracted && (
          <div className="ai-extract">
            {extracted.found.length === 0 ? (
              <span className="ai-soft">No known symptom phrase found — add phrases in Knowledge &amp; extraction › Synonyms.</span>
            ) : (
              extracted.found.map((f) => (
                <span className="ai-chip" key={f.key}>
                  <span className="mono">“{f.phrase}”</span> → <span>{symptomLabel(f.key)}</span>
                </span>
              ))
            )}
            {extracted.negated.map((k) => (
              <span className="ai-chip neg" key={'no-' + k}>
                <span>No</span> <span>{symptomLabel(k)}</span>
              </span>
            ))}
          </div>
        )}

        <div className="section-label">Structured case</div>
        <div className="ai-grid2">
          <div className="field">
            <label>Age (years)</label>
            <input type="number" min="0" value={c.age} onChange={(e) => setC({ ...c, age: e.target.value })} />
          </div>
          <div className="field">
            <label>Symptom duration (days)</label>
            <input type="number" min="0" value={c.days} onChange={(e) => setC({ ...c, days: e.target.value })} />
          </div>
        </div>
        <div className="ai-sym-picker" style={{ marginTop: 10 }}>
          {SYMPTOMS.map((s) => (
            <button key={s.key} type="button" className={'ai-sym' + (c.symptoms.includes(s.key) ? ' on' : '')} onClick={() => toggleSym(s.key)}>
              {c.symptoms.includes(s.key) && <Icon name="check" />}
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="ai-grid-vitals">
          {VITALS.map((v) => (
            <div className="field" key={v.key}>
              <label>
                {v.label} <span className="ai-soft">({v.unit})</span>
              </label>
              <input
                type="number"
                step={v.step}
                value={c.vitals[v.key]}
                onChange={(e) => setC({ ...c, vitals: { ...c.vitals, [v.key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
        <div className="ai-tester-foot">
          <label className="ai-check">
            <input type="checkbox" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} />
            <span>Include unapproved drafts (test before approving)</span>
          </label>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setC(BLANK)
              setText('')
              setExtracted(null)
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="ai-tester-out">
        {empty ? (
          <Empty icon="flask" title="Enter a test case" text="Pick symptoms and vital signs, or type a free-text complaint and extract it." />
        ) : (
          <>
            {missingFields.length > 0 && (
              <div className="warn-banner show caution" style={{ marginTop: 0 }}>
                <div className="icon">
                  <Icon name="help" />
                </div>
                <div className="txt">
                  <b>The system would ask back</b>
                  {missingFields.map((f) => (
                    <div key={f.key}>• {f.question}</div>
                  ))}
                </div>
              </div>
            )}
            {clashes.length > 0 && (
              <div className="warn-banner show danger">
                <div className="icon">
                  <Icon name="alert" />
                </div>
                <div className="txt">
                  <b>Contradicting rules fired together</b>
                  {clashes.map((i) => (
                    <div key={i.rule.id + i.with.id} className="mono">
                      {i.rule.id} ↔ {i.with.id}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="section-label">Alerts (always shown)</div>
            {res.alerts.length === 0 ? <p className="ai-soft">None.</p> : res.alerts.map((f) => <Fired key={f.rule.id} f={f} />)}

            <div className="section-label">
              <span>Diagnosis suggestions</span>{' '}
              <span className="ai-soft ai-norm">
                (<span>confidence</span> ≥ <span className="mono">{fmtWeight(settings.minConfidence)}</span>, <span>max</span>{' '}
                <span className="mono">{settings.maxSuggestions}</span>)
              </span>
            </div>
            {res.dxShown.length === 0 ? <p className="ai-soft">None.</p> : res.dxShown.map((f) => <Fired key={f.rule.id} f={f} />)}

            {res.dxHidden.length > 0 && (
              <>
                <div className="section-label">Fired but hidden by module settings</div>
                {res.dxHidden.map((f) => (
                  <Fired key={f.rule.id} f={f} hidden />
                ))}
              </>
            )}

            {res.incomplete.length > 0 && (
              <>
                <div className="section-label">Could fire if more information is given</div>
                {res.incomplete.map(({ rule, missing }) => (
                  <div className="ai-near" key={rule.id}>
                    <span className="mono">{rule.id}</span> <TypeBadge type={rule.type} /> <IcdCell code={rule.icd} /> — <span>missing</span>{' '}
                    {missing.map((m) => (
                      <span className="ai-chip meta" key={m}>
                        {m === 'age' ? 'Age' : m === 'days' ? 'Symptom duration' : vitalOf(m).label}
                      </span>
                    ))}
                  </div>
                ))}
              </>
            )}
            <p className="ai-foot-note">
              <Icon name="lock" /> <span>Results are labelled “Unconfirmed” and are only written to the record after a doctor confirms them.</span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Fired({ f, hidden }) {
  const r = f.rule
  return (
    <div className={'ai-fired ' + r.type + (hidden ? ' hidden' : '')}>
      <div className="ai-fired-head">
        <TypeBadge type={r.type} /> <IcdCell code={r.icd} />
        <span className="ai-fired-right">
          <span className="badge muted">Unconfirmed</span> <span className="mono">{fmtWeight(r.weight)}</span>
        </span>
      </div>
      <div className="ai-fired-why">
        <span className="ai-soft">Because</span>{' '}
        {f.hits.map((h, i) => (
          <span className="ai-chip ok" key={i}>
            {h.kind === 'symptom' && <span>{symptomLabel(h.key)}</span>}
            {h.kind === 'absent' && (
              <>
                <span>No</span> <span>{symptomLabel(h.key)}</span>
              </>
            )}
            {h.kind === 'age' && <span>Age</span>}
            {h.kind === 'days' && <span>Symptom duration</span>}
            {h.kind === 'vital' && (
              <>
                <span>{vitalOf(h.key).label}</span>{' '}
                <span className="mono">
                  {h.value} {opLabel(r.cond.vitals.find((v) => v.key === h.key)?.op)} {r.cond.vitals.find((v) => v.key === h.key)?.value}
                </span>
              </>
            )}{' '}
            ✓
          </span>
        ))}
      </div>
      <div className="ai-fired-rat">{r.rationale}</div>
      <div className="ai-soft ai-small">
        <span className="mono">{r.id}</span> · <span>{r.reference}</span>
      </div>
    </div>
  )
}
