import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { useAIConfig } from '../../api/aiConfigStore'
import { mockAssessment } from '../../api/assessmentMock'
import { DEMO_MODE } from '../../api/client'
import { getAssessment, missingName } from '../../api/clinicApi'

// Chưa có kết quả (đang tải, hoặc lượt chưa được đánh giá — 404).
const EMPTY = { assessment_id: null, ai_status: 'Pending', mode: null, knowledge_release: null, model_version: null, prompt_version: null, priority: null, alerts: [], complete_now: [], candidates: [] }

// Kết quả AI của lượt khám, hỏi lại mỗi 2 giây tới khi có kết quả cuối. Demo: assessmentMock;
// chạy thật: GET /visits/{id}/assessment (404 = chưa được đánh giá).
export function useAssessment(visit) {
  const ai = useAIConfig()
  const [now, setNow] = useState(Date.now())
  const [server, setServer] = useState(EMPTY)
  const a = DEMO_MODE ? mockAssessment(visit, ai, now) : server
  const done = ['Ready', 'Degraded', 'Failed', 'Skipped', 'None'].includes(a.ai_status)
  useEffect(() => {
    if (done) return
    const tick = DEMO_MODE
      ? () => setNow(Date.now())
      : () => getAssessment(visit.id).then((r) => setServer(r ?? { ...EMPTY, ai_status: 'None' }), () => {})
    if (!DEMO_MODE) tick()
    const t = setInterval(tick, 2000)
    return () => clearInterval(t)
  }, [done, visit.id])
  return a
}

const STATUS = {
  Pending: { label: 'AI analysis in progress…', tone: 'muted' },
  Preliminary: { label: 'Preliminary — rule ranking', tone: 'muted' },
  Ready: { label: 'Full — ranked and explained', tone: 'ok' },
  Degraded: { label: 'Rule-only', tone: 'low' },
  Failed: { label: 'AI assessment failed', tone: 'low' },
  None: { label: 'Not assessed yet', tone: 'muted' },
  Skipped: { label: 'Red flag — no AI suggestion', tone: 'low' }
}
const DISMISS = [
  ['differs', 'Clinical picture differs'],
  ['known', 'Already diagnosed'],
  ['info', 'Insufficient information'],
  ['broad', 'Rule too broad']
]

// Luôn ghi rõ là gợi ý chưa xác nhận. decisions: { [condition_code]: 'accepted' | 'dismissed' } — trang cha giữ để ghi khi chốt đơn.
export default function AssessmentCard({ a, decisions, onAccept, onDismiss }) {
  const [dismissing, setDismissing] = useState(null)
  const st = STATUS[a.ai_status]
  return (
    <div className="ai-box assess-card" style={{ marginTop: 10 }}>
      <div className="icon">
        <Icon name="bulb" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="assess-head">
          <span className="label">{translate('A — Assessment · Reference suggestion (unconfirmed)')}</span>
          <span className={'badge ' + st.tone}>{translate(st.label)}</span>
        </div>
        {a.ai_status === 'Degraded' && (
          <p className="assess-banner">
            <Icon name="alert" />{' '}
            {translate('The AI model is unavailable — candidates below are ranked by the approved rules only, without an AI explanation.')}
          </p>
        )}
        {a.ai_status === 'Skipped' && (
          <p className="assess-banner">
            <Icon name="ban" /> {translate('A red-flag rule matched — the pipeline stopped before the AI model, so no diagnosis is suggested. Assess and refer if needed.')}
          </p>
        )}
        {a.ai_status === 'Failed' && (
          <p className="assess-banner">
            <Icon name="alert" /> {translate('The AI assessment could not be completed — examine and diagnose as usual.')}
          </p>
        )}
        {a.ai_status === 'Pending' && <p className="ai-soft assess-note">{translate('Waiting for the result — you can keep examining; it appears here automatically.')}</p>}
        {a.ai_status === 'Preliminary' && <p className="ai-soft assess-note">{translate('Preliminary ranking by the approved rules — the AI explanation will appear here automatically.')}</p>}

        {a.candidates.map((c, i) => (
          <div className="assess-cand" key={c.condition_code}>
            <div className="assess-cand-top">
              <span className="assess-rank">{c.rank}</span>
              {c.icd10_code && <span className="mono">{c.icd10_code}</span>} <b>{c.name_vi}</b>
              <span className="assess-score" title={translate('Match score')}>
                <span style={{ width: Math.round(c.score * 100) + '%' }} />
              </span>
              <span className="ai-soft mono" style={{ fontSize: 11.5 }}>
                {Math.round(c.score * 100)}%
              </span>
              {decisions[c.condition_code] === 'accepted' ? (
                <span className="badge ok">{translate('Accepted')}</span>
              ) : decisions[c.condition_code] === 'dismissed' ? (
                <span className="badge muted">{translate('Dismissed')}</span>
              ) : dismissing === c.condition_code ? (
                <select
                  className="ai-select"
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return
                    onDismiss(c, e.target.value)
                    setDismissing(null)
                  }}
                >
                  <option value="">{translate('— Reason for dismissing —')}</option>
                  {DISMISS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {translate(l)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="ai-sug-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => onAccept(c)} title={i === 0 ? 'Alt+D' : undefined}>
                    <Icon name="check" /> <span>{translate('Accept')}</span>
                    {i === 0 && <kbd>Alt+D</kbd>}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDismissing(c.condition_code)}>
                    <Icon name="x" /> <span>{translate('Dismiss')}</span>
                  </button>
                </span>
              )}
            </div>
            <div className="assess-evidence">
              {c.supporting.map((s) => (
                <span key={'s' + s.symptom_code} className="ev sup" title={translate('Supporting finding')}>
                  + {s.symptom_name}
                </span>
              ))}
              {c.contradicting.map((s) => (
                <span key={'c' + s.symptom_code} className="ev con" title={translate('Contradicting finding')}>
                  − {s.symptom_name}
                </span>
              ))}
              {c.missing.map((s) => (
                <span key={'m' + s.symptom_code} className="ev mis" title={translate('Not yet known')}>
                  ? {s.symptom_name}
                </span>
              ))}
            </div>
            {c.explanation && <p className="assess-expl">{c.explanation}</p>}
          </div>
        ))}
        {['Ready', 'Degraded'].includes(a.ai_status) && !a.candidates.length && (
          <p className="ai-soft assess-note">{translate('No condition in the approved knowledge base matches the symptoms recorded at check-in.')}</p>
        )}
        {a.complete_now.length > 0 && (
          <p className="assess-note need">
            {translate('Still unknown — ask or measure')}: {a.complete_now.map(missingName).join(', ')}
          </p>
        )}
        <p className="ai-soft assess-meta">
          {translate('Knowledge')} {a.knowledge_release ?? '—'} · {translate('model')} {a.model_version ?? '—'} · {translate('prompt')} {a.prompt_version ?? '—'}
        </p>
      </div>
    </div>
  )
}
