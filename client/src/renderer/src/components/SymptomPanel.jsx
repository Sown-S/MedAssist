import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import SymptomChecklist from './SymptomChecklist'
import { translate } from '../i18n'
import { symptomName, extractionStale } from '../api/symptoms'
import { useAiHealth } from '../api/connectivity'

// Server tự kết thúc lượt trích xuất sau 30 giây tính từ POST (kể cả lúc xếp hàng). Client đếm từ lúc bấm và chờ thêm
// 5 giây để bù khoảng hỏi lại 2 giây và độ trễ mạng. Thanh tiến trình chạy theo thời gian, đầy ở mốc 30 giây.
const SERVER_LIMIT_S = 30
const EXTRACTION_TIMEOUT_MS = 35000
// Bước đang chạy lấy từ status server trả về (Queued / Running).
const STEPS = [
  ['saving', 'Description saved'],
  ['queued', 'Waiting for the model'],
  ['running', 'The model is reading'],
  ['shown', 'Showing suggestions']
]
const STEP_AT = { saving: 0, queued: 1, running: 2 }

// Nhập triệu chứng có cấu trúc + trích xuất từ lời kể có người xác nhận (HITL — FR12, FR14).
// value chỉ chứa mục lễ tân đã chọn / xác nhận.
// Đề xuất của mô hình chỉ là chip chờ xác nhận; chưa xác nhận thì không được dùng.
export default function SymptomPanel({ value, onChange, text, onText, disabled = false, textLocked = false, onExtract, onVitals }) {
  // idle | running { phase, queueAhead, startedAt } | done { seconds, count } | failed { timeout, message }
  const [job, setJob] = useState({ status: 'idle' })
  const [now, setNow] = useState(Date.now())
  const [proposals, setProposals] = useState([])
  const [unsure, setUnsure] = useState([])
  // Lời kể của lần trích xuất đã có kết quả — đề xuất cũ thì khoá xác nhận.
  const [from, setFrom] = useState(null)
  const ctrl = useRef(null)
  // Kết quả lần đọc gần nhất: bấm “Hủy” lần chạy sau thì quay lại dòng này.
  const lastDone = useRef({ status: 'idle' })
  useEffect(() => () => ctrl.current?.abort(), [])
  const ai = useAiHealth()

  const running = job.status === 'running'
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [running])

  const setState = (code, state, source = 'Form') => {
    const next = { ...value }
    if (state === 'UNKNOWN') delete next[code]
    else next[code] = { state, source }
    onChange(next)
  }

  async function extract() {
    if (!text.trim() || !ai.ok) return
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    const startedAt = Date.now()
    let timedOut = false
    const timer = setTimeout(() => ((timedOut = true), c.abort()), EXTRACTION_TIMEOUT_MS)
    setNow(startedAt)
    setJob({ status: 'running', phase: 'saving', queueAhead: null, startedAt })
    const onProgress = ({ status, queueAhead }) => {
      if (ctrl.current !== c) return
      if (status === 'Queued' || status === 'Running') setJob((j) => (j.status === 'running' ? { ...j, phase: status === 'Running' ? 'running' : 'queued', queueAhead } : j))
    }
    try {
      const r = await onExtract(text, { signal: c.signal, onProgress, timeoutMs: EXTRACTION_TIMEOUT_MS - (Date.now() - startedAt) })
      // Đã bấm Hủy hoặc chạy lần mới: bỏ qua kết quả về muộn.
      if (ctrl.current !== c) return
      setProposals(r.proposals.filter((p) => !value[p.symptom_code]))
      setUnsure(r.unsure ?? [])
      const src = { text, textChanged: !!r.textChanged }
      setFrom(src)
      onVitals?.(r.vitalProposals ?? [], src)
      const done = { status: 'done', seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)), count: r.proposals.length, unsure: (r.unsure ?? []).length }
      lastDone.current = done
      setJob(done)
    } catch (e) {
      if (ctrl.current !== c) return
      // Lỗi của form (thiếu thông tin, hồ sơ có thể trùng), không phải lỗi AI.
      if (e.code === 'FORM') return setJob(lastDone.current)
      const timeout = timedOut || e.code === 'TIMEOUT'
      setJob({ status: 'failed', timeout, message: timeout || e.code === 'AI_UNAVAILABLE' || e.code === 'ABORTED' ? '' : e.message })
    } finally {
      clearTimeout(timer)
      if (ctrl.current === c) ctrl.current = null
    }
  }
  // Chỉ ngừng chờ ở client; lượt trên server tự kết thúc trong 30 giây, kết quả về muộn bị bỏ qua.
  function cancel() {
    const c = ctrl.current
    ctrl.current = null
    c?.abort()
    setJob(lastDone.current)
  }

  // Lời kể sửa sau lần đọc (hoặc server báo text_changed) → không xác nhận được, phải trích xuất lại.
  const stale = extractionStale(from, text)
  function accept(p) {
    if (stale) return
    setState(p.symptom_code, p.state, 'Extracted')
    setProposals((list) => list.filter((x) => x.symptom_code !== p.symptom_code))
  }
  function acceptAll() {
    if (stale) return
    const next = { ...value }
    for (const p of proposals) next[p.symptom_code] = { state: p.state, source: 'Extracted' }
    onChange(next)
    setProposals([])
  }
  const flip = (p) => !stale && setProposals((list) => list.map((x) => (x.symptom_code === p.symptom_code ? { ...x, state: x.state === 'PRESENT' ? 'ABSENT' : 'PRESENT' } : x)))
  const drop = (p) => setProposals((list) => list.filter((x) => x.symptom_code !== p.symptom_code))

  // Mục chưa rõ: hết nhắc khi lễ tân đã chọn Có / Không ở danh sách bên dưới.
  const askAgain = job.status === 'done' && !stale ? unsure.filter((u) => !value[u.symptom_code]) : []

  const elapsed = running ? Math.max(0, (now - job.startedAt) / 1000) : 0
  const left = Math.max(0, Math.ceil(SERVER_LIMIT_S - elapsed))
  const step = running ? STEP_AT[job.phase] : -1
  const aiDown = !ai.ok && ai.reason !== 'disabled'

  const chip = (p) => (
    <span key={p.symptom_code} className={'sym-chip pending ' + p.state.toLowerCase()}>
      <span className="sym-chip-name">{translate(symptomName(p.symptom_code))}</span>
      <button type="button" className="sym-chip-state" disabled={disabled || stale} onClick={() => flip(p)} title={translate('Switch Yes / No')}>
        {translate(p.state === 'PRESENT' ? 'Switch to No' : 'Switch to Yes')}
      </button>
      <button type="button" className="sym-chip-ok" disabled={disabled || stale} onClick={() => accept(p)} title={translate('Confirm')}>
        <Icon name="check" />
      </button>
      <button type="button" className="sym-chip-x" disabled={disabled} onClick={() => drop(p)} title={translate('Discard')}>
        <Icon name="x" />
      </button>
    </span>
  )

  return (
    <div className="sym-panel">
      <div className="field full">
        <label>Patient’s description (free text, Vietnamese)</label>
        <textarea rows="3" disabled={disabled || textLocked} placeholder="Sốt cao 2 ngày, ho có đờm, đau họng, không khó thở…" value={text} onChange={(e) => onText(e.target.value)} />
      </div>

      {ai.reason !== 'disabled' && (
        <div className="sym-ai" aria-live="polite">
          {aiDown && (
            <div className="sym-alert">
              <Icon name="alert" />
              <span>
                <b>{translate('Suggestions from the description are unavailable for now — pick the symptoms in the list below.')}</b>
                {ai.detail && <span className="sym-alert-detail">{ai.detail}</span>}
              </span>
            </div>
          )}
          {!running && (
            <div className="sym-ai-head">
              <button type="button" className="btn btn-primary" disabled={disabled || textLocked || !text.trim() || aiDown} onClick={extract}>
                <Icon name="bulb" /> Read description & suggest
              </button>
              {job.status === 'done' && (
                <span className="ai-soft sym-ai-last">{translate(`Last read: ${job.seconds} s · ${job.count} suggestions`)}</span>
              )}
              {job.status === 'idle' && !aiDown && <span className="ai-soft">Takes at most 30 seconds.</span>}
            </div>
          )}

          {running && (
            <div className="sym-progress">
              <ol className="sym-steps">
                {STEPS.map(([key, label], i) => (
                  <li key={key} className={i < step ? 'done' : i === step ? 'active' : ''}>
                    <span className="dot">{i < step ? <Icon name="check" /> : i + 1}</span>
                    <span>{translate(label)}</span>
                    {key === 'queued' && step === 1 && job.queueAhead > 0 && <small className="sym-ahead">{translate(`${job.queueAhead} ahead in line`)}</small>}
                  </li>
                ))}
              </ol>
              <div className="sym-bar" role="progressbar" aria-valuemin={0} aria-valuemax={SERVER_LIMIT_S} aria-valuenow={Math.min(SERVER_LIMIT_S, Math.round(elapsed))}>
                <span style={{ width: Math.min(100, (elapsed / SERVER_LIMIT_S) * 100) + '%' }} />
              </div>
              <div className="sym-ai-meta">
                <span>
                  <b className="sym-secs">{translate(`${Math.floor(elapsed)} s`)}</b> · {translate(`at most ${left} s left`)} · {translate('max 30 seconds')}
                </span>
                <span className="sym-cancel">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={cancel}>
                    <Icon name="x" /> Cancel
                  </button>
                  <small>Stop waiting for the result</small>
                </span>
              </div>
              <p className="ai-soft sym-ai-hint">You can enter vital signs while waiting.</p>
            </div>
          )}

          {job.status === 'failed' && (
            <div className="sym-alert">
              <Icon name="alert" />
              <span>
                <b>{translate(job.timeout ? 'No result within 30 seconds.' : 'The model could not read the description this time.')}</b>
                {job.message && <span className="sym-alert-detail">{translate(job.message)}</span>}
                <span className="sym-alert-detail">{translate('Pick the symptoms in the list below.')}</span>
              </span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={disabled || textLocked || !text.trim() || aiDown} onClick={extract}>
                <Icon name="repeat" /> Try again
              </button>
            </div>
          )}
          {stale && !running && (
            <span className="sym-warn">
              <Icon name="alert" /> {translate('The description changed after the last suggestion — run it again.')}
            </span>
          )}
          {/* Rỗng có thể do mô hình bỏ sót hoặc không khớp được danh mục: không được đọc thành “bệnh nhân không có triệu chứng”. */}
          {job.status === 'done' && !proposals.length && job.count === 0 && !askAgain.length && (
            <p className="sym-warn">
              <Icon name="alert" /> {translate('The model did not recognise any symptom in the description. This does not mean the patient has none — ask again and pick in the list below.')}
            </p>
          )}
          {askAgain.length > 0 && (
            <p className="sym-warn">
              <Icon name="alert" /> {translate('Not sure — ask the patient again:')} {askAgain.map((u) => u.name || translate(symptomName(u.symptom_code))).join(', ')}
            </p>
          )}

          {proposals.length > 0 && (
            <div className="sym-proposals">
              <div className="sym-proposals-head">
                <b>{translate('Suggested — confirm before use')}</b>
                <button type="button" className="btn btn-primary btn-sm" disabled={disabled || stale} onClick={acceptAll}>
                  <Icon name="check" /> {translate('Confirm all')}
                </button>
              </div>
              <div className="sym-prop-cols">
                {[
                  ['PRESENT', 'Yes'],
                  ['ABSENT', 'No']
                ].map(([state, label]) => (
                  <div key={state} className={'sym-prop-col ' + state.toLowerCase()}>
                    <div className="sym-prop-title">{translate(label)}</div>
                    <div className="sym-chips">{proposals.filter((p) => p.state === state).map(chip)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <SymptomChecklist value={value} onSet={setState} disabled={disabled} />
    </div>
  )
}
