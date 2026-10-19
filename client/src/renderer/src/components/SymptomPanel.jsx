import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { translate } from '../i18n'
import { STATES, SOURCES, useSymptomCatalog, groupSymptoms, symptomName, requestExtraction, EXTRACTION_TIMEOUT_MS } from '../api/symptoms'

// Nhập triệu chứng có cấu trúc + trích xuất từ mô tả tự do có NGƯỜI XÁC NHẬN (HITL — FR12, FR14, Architecture 5.1.2).
//  - value: { mã: { state: PRESENT|ABSENT|UNKNOWN, source: Form|Extracted|Prompt } } — chỉ chứa mục lễ tân đã chọn / xác nhận.
//  - text / onText: lời kể của bệnh nhân (tiếng Việt, tự do).
//  - ask: mã triệu chứng luật cờ đỏ đang thiếu (Adaptive Lite) → hiện "Hỏi ngay" để lễ tân hỏi và chọn.
// Đề xuất của mô hình chỉ là CHIP CHỜ XÁC NHẬN; bấm xác nhận thì mới vào value (nguồn Extracted). Chưa xác nhận = không dùng.
export default function SymptomPanel({ value, onChange, text, onText, ask = [], disabled = false }) {
  const [job, setJob] = useState({ status: 'idle' }) // idle | running | done | failed
  const [proposals, setProposals] = useState([])
  const ctrl = useRef(null)
  useEffect(() => () => ctrl.current?.abort(), [])
  const catalog = useSymptomCatalog()

  const setState = (code, state, source = 'Form') => {
    const next = { ...value }
    if (state === 'UNKNOWN') delete next[code]
    else next[code] = { state, source }
    onChange(next)
  }

  async function extract() {
    if (!text.trim()) return
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    const timer = setTimeout(() => c.abort(), EXTRACTION_TIMEOUT_MS)
    setJob({ status: 'running' })
    try {
      const r = await requestExtraction(text, { signal: c.signal })
      // Mã đã được lễ tân chọn thì không đề xuất lại.
      setProposals(r.proposals.filter((p) => !value[p.symptom_code]))
      setJob({ status: 'done', count: r.proposals.length })
    } catch (e) {
      if (c.signal.aborted && e.code === 'ABORTED' && ctrl.current !== c) return
      setJob({ status: 'failed', timeout: e.code === 'ABORTED' })
    } finally {
      clearTimeout(timer)
    }
  }
  function accept(p) {
    setState(p.symptom_code, p.state, 'Extracted')
    setProposals((list) => list.filter((x) => x.symptom_code !== p.symptom_code))
  }
  function acceptAll() {
    const next = { ...value }
    for (const p of proposals) next[p.symptom_code] = { state: p.state, source: 'Extracted' }
    onChange(next)
    setProposals([])
  }
  const flip = (p) => setProposals((list) => list.map((x) => (x.symptom_code === p.symptom_code ? { ...x, state: x.state === 'PRESENT' ? 'ABSENT' : 'PRESENT' } : x)))
  const drop = (p) => setProposals((list) => list.filter((x) => x.symptom_code !== p.symptom_code))

  // Chỉ nhắc mã có trong danh mục đang dùng (luật giả lập dùng mã của danh mục mẫu).
  const inCatalog = new Set(catalog.list.map((s) => s.key))
  const asking = ask.filter((code) => !value[code] && inCatalog.has(code))

  return (
    <div className="sym-panel">
      <div className="field full">
        <label>Patient’s description (free text, Vietnamese)</label>
        <textarea rows="2" disabled={disabled} placeholder="Sốt cao 2 ngày, ho có đờm, đau họng, không khó thở…" value={text} onChange={(e) => onText(e.target.value)} />
      </div>
      <div className="sym-extract">
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled || !text.trim() || job.status === 'running'} onClick={extract}>
          <Icon name="bulb" /> {job.status === 'running' ? translate('Reading the description…') : translate('Suggest symptoms from description')}
        </button>
        {job.status === 'running' && <span className="ai-soft">{translate('Runs in the background — keep entering vital signs.')}</span>}
        {job.status === 'failed' && (
          <span className="sym-warn">
            <Icon name="alert" /> {translate(job.timeout ? 'Extraction timed out' : 'Extraction unavailable')} — {translate('continue with the checklist below.')}
          </span>
        )}
        {job.status === 'done' && !proposals.length && job.count === 0 && <span className="ai-soft">{translate('No catalog symptoms found — use the checklist below.')}</span>}
      </div>

      {proposals.length > 0 && (
        <div className="sym-proposals">
          <div className="sym-proposals-head">
            <b>{translate('Suggested — confirm before use')}</b>
            <button type="button" className="btn btn-primary btn-sm" disabled={disabled} onClick={acceptAll}>
              <Icon name="check" /> {translate('Confirm all')}
            </button>
          </div>
          <div className="sym-chips">
            {proposals.map((p) => (
              <span key={p.symptom_code} className={'sym-chip pending ' + p.state.toLowerCase()} title={p.phrase ? '“' + p.phrase + '”' : ''}>
                <button type="button" className="sym-chip-state" disabled={disabled} onClick={() => flip(p)} title={translate('Switch Yes / No')}>
                  {translate(p.state === 'PRESENT' ? 'Yes' : 'No')}
                </button>
                <span>{translate(symptomName(p.symptom_code))}</span>
                <button type="button" className="sym-chip-ok" disabled={disabled} onClick={() => accept(p)} title={translate('Confirm')}>
                  <Icon name="check" />
                </button>
                <button type="button" className="sym-chip-x" disabled={disabled} onClick={() => drop(p)} title={translate('Discard')}>
                  <Icon name="x" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {asking.length > 0 && (
        <div className="sym-ask">
          <Icon name="alert" /> <b>{translate('Ask now')}:</b>
          {asking.map((code) => (
            <span key={code} className="sym-ask-item">
              {translate(symptomName(code))}
              <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => setState(code, 'PRESENT', 'Prompt')}>
                {translate('Yes')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => setState(code, 'ABSENT', 'Prompt')}>
                {translate('No')}
              </button>
            </span>
          ))}
        </div>
      )}

      {catalog.status === 'loading' && <p className="ai-soft">{translate('Loading the symptom list…')}</p>}
      {catalog.status === 'failed' && (
        <p className="sym-warn">
          <Icon name="alert" /> {translate('Could not load the symptom list from the server.')}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={catalog.reload}>
            {translate('Try again')}
          </button>
        </p>
      )}
      {groupSymptoms(catalog.list).map((g) => (
        <div key={g.key}>
          {g.label && <div className="sym-group">{translate(g.label)}</div>}
          <div className="sym-grid">
            {g.items.map((s) => {
              const cur = value[s.key]?.state ?? 'UNKNOWN'
              return (
                <div key={s.key} className={'sym-row' + (cur !== 'UNKNOWN' ? ' set' : '') + (ask.includes(s.key) && cur === 'UNKNOWN' ? ' ask' : '')}>
                  <span className="sym-name">
                    {translate(s.label)}
                    {value[s.key] && value[s.key].source !== 'Form' && <small className="sym-src">{translate(SOURCES[value[s.key].source])}</small>}
                  </span>
                  <span className="ai-seg sym-seg">
                    {STATES.map((x) => (
                      <button type="button" key={x.key} disabled={disabled} className={(cur === x.key ? 'active ' : '') + x.key.toLowerCase()} onClick={() => setState(s.key, x.key)}>
                        {translate(x.label)}
                      </button>
                    ))}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
