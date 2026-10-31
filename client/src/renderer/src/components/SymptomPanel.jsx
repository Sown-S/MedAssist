import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { translate } from '../i18n'
import { STATES, SOURCES, useSymptomCatalog, groupSymptoms, symptomName, requestExtraction, EXTRACTION_TIMEOUT_MS } from '../api/symptoms'

// Nhập triệu chứng có cấu trúc + trích xuất từ lời kể có người xác nhận (HITL — FR12, FR14).
// value chỉ chứa mục lễ tân đã chọn / xác nhận. ask: triệu chứng luật cờ đỏ đang thiếu → hiện “Hỏi ngay”.
// Đề xuất của mô hình chỉ là chip chờ xác nhận; chưa xác nhận thì không được dùng.
export default function SymptomPanel({ value, onChange, text, onText, ask = [], disabled = false, textLocked = false, onExtract = requestExtraction, onVitals }) {
  const [job, setJob] = useState({ status: 'idle' })
  const [proposals, setProposals] = useState([])
  const ctrl = useRef(null)
  useEffect(() => () => ctrl.current?.abort(), [])
  const catalog = useSymptomCatalog()
  // Mặc định mở: dấu hiệu nguy hiểm, nhóm đã có lựa chọn hoặc đang được nhắc hỏi.
  const [openGroups, setOpenGroups] = useState({})

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
      const r = await onExtract(text, { signal: c.signal })
      setProposals(r.proposals.filter((p) => !value[p.symptom_code]))
      onVitals?.(r.vitalProposals ?? [])
      // Lời kể sửa sau lần đọc (hoặc server báo text_changed) → nhắc trích xuất lại.
      setJob({ status: 'done', count: r.proposals.length, text, textChanged: !!r.textChanged })
    } catch (e) {
      if (c.signal.aborted && e.code === 'ABORTED' && ctrl.current !== c) return
      // Lỗi của form (thiếu thông tin, hồ sơ có thể trùng), không phải lỗi AI.
      if (e.code === 'FORM') return setJob({ status: 'idle' })
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

  // Chỉ nhắc mã có trong danh mục đang dùng.
  const inCatalog = new Set(catalog.list.map((s) => s.key))
  const asking = ask.filter((code) => !value[code] && inCatalog.has(code))

  return (
    <div className="sym-panel">
      <div className="field full">
        <label>Patient’s description (free text, Vietnamese)</label>
        <textarea rows="2" disabled={disabled || textLocked} placeholder="Sốt cao 2 ngày, ho có đờm, đau họng, không khó thở…" value={text} onChange={(e) => onText(e.target.value)} />
      </div>
      <div className="sym-extract">
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled || textLocked || !text.trim() || job.status === 'running'} onClick={extract}>
          <Icon name="bulb" /> {job.status === 'running' ? translate('Reading the description…') : translate('Suggest symptoms from description')}
        </button>
        {job.status === 'running' && <span className="ai-soft">{translate('Runs in the background — keep entering vital signs.')}</span>}
        {job.status === 'failed' && (
          <span className="sym-warn">
            <Icon name="alert" /> {translate(job.timeout ? 'Extraction timed out' : 'Extraction unavailable')} — {translate('continue with the checklist below.')}
          </span>
        )}
        {job.status === 'done' && (job.textChanged || job.text !== text) && (
          <span className="sym-warn">
            <Icon name="alert" /> {translate('The description changed after the last suggestion — run it again.')}
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
      {groupSymptoms(catalog.list).map((g) => {
        const picked = g.items.filter((s) => value[s.key]).length
        const isOpen = !g.label || (openGroups[g.key] ?? (g.key === 'red_flag_sign' || picked > 0 || g.items.some((s) => ask.includes(s.key))))
        return (
        <div key={g.key} className={'sym-section' + (g.label ? ' grouped' : '') + (g.key === 'red_flag_sign' ? ' danger' : '')}>
          {g.label && (
            <button type="button" className="sym-group" aria-expanded={isOpen} onClick={() => setOpenGroups((o) => ({ ...o, [g.key]: !isOpen }))}>
              <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} />
              <span>{translate(g.label)}</span>
              <span className="sym-count">{picked > 0 ? picked + '/' + g.items.length : g.items.length}</span>
            </button>
          )}
          {isOpen && (
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
          )}
        </div>
        )
      })}
    </div>
  )
}
