import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { useAIConfig } from '../../api/aiConfigStore'
import { mockAssessment } from '../../api/assessmentMock'

// Lấy kết quả đánh giá AI của lượt khám, tự làm mới mỗi 2 giây cho tới khi có kết quả cuối (polling — Architecture 5.1.4).
// Backend thật: thay mockAssessment bằng GET /api/v1/visits/{id}/assessment.
export function useAssessment(visit) {
  const ai = useAIConfig()
  const [now, setNow] = useState(Date.now())
  const a = mockAssessment(visit, ai, now)
  const done = ['Ready', 'Degraded', 'Skipped'].includes(a.ai_status)
  useEffect(() => {
    if (done) return
    const t = setInterval(() => setNow(Date.now()), 2000)
    return () => clearInterval(t)
  }, [done])
  return a
}

const STATUS = {
  Pending: { label: 'AI analysis in progress…', tone: 'muted' },
  Ready: { label: 'Full — ranked and explained', tone: 'ok' },
  Degraded: { label: 'Rule-only', tone: 'low' },
  Skipped: { label: 'Red flag — no AI suggestion', tone: 'low' }
}
const DISMISS = [
  ['differs', 'Clinical picture differs'],
  ['known', 'Already diagnosed'],
  ['info', 'Insufficient information'],
  ['broad', 'Rule too broad']
]

// Thẻ "Gợi ý tham khảo" ở khung A — Assessment: luôn ghi rõ là gợi ý chưa xác nhận; bác sĩ chấp nhận / chọn chẩn đoán khác.
// decisions: { [condition_code]: 'accepted' | 'dismissed' } — trang cha giữ để ghi quyết định khi chốt đơn.
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
            {translate(
              a.reason === 'off'
                ? 'The AI module is turned off — candidates below are ranked by the approved rules only, without an AI explanation.'
                : 'The AI model did not answer in time — candidates below are ranked by the approved rules only, without an AI explanation.'
            )}
          </p>
        )}
        {a.ai_status === 'Skipped' && (
          <p className="assess-banner">
            <Icon name="ban" /> {translate('A red-flag rule matched — the pipeline stopped before the AI model, so no diagnosis is suggested. Assess and refer if needed.')}
          </p>
        )}
        {a.ai_status === 'Pending' && <p className="ai-soft assess-note">{translate('Waiting for the result — you can keep examining; it appears here automatically.')}</p>}

        {a.candidates.map((c, i) => (
          <div className="assess-cand" key={c.condition_code}>
            <div className="assess-cand-top">
              <span className="assess-rank">{i + 1}</span>
              <span className="mono">{c.icd10}</span> <b>{translate(c.name)}</b>
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
                  <button className="btn btn-ghost btn-sm" onClick={() => onAccept(c)}>
                    <Icon name="check" /> <span>{translate('Accept')}</span>
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDismissing(c.condition_code)}>
                    <Icon name="x" /> <span>{translate('Dismiss')}</span>
                  </button>
                </span>
              )}
            </div>
            <div className="assess-evidence">
              {c.supporting.map((s) => (
                <span key={'s' + s} className="ev sup" title={translate('Supporting finding')}>
                  + {translate(s)}
                </span>
              ))}
              {c.contradicting.map((s) => (
                <span key={'c' + s} className="ev con" title={translate('Contradicting finding')}>
                  − {translate(s)}
                </span>
              ))}
              {c.missing.map((s) => (
                <span key={'m' + s} className="ev mis" title={translate('Not yet known')}>
                  ? {translate(s)}
                </span>
              ))}
            </div>
            {c.explanation && <p className="assess-expl">{c.explanation}</p>}
          </div>
        ))}
        {['Ready', 'Degraded'].includes(a.ai_status) && !a.candidates.length && (
          <p className="ai-soft assess-note">{translate('No condition in the approved knowledge base matches the symptoms recorded at check-in.')}</p>
        )}
        {a.missing.length > 0 && (
          <p className="assess-note need">
            {translate('Still unknown — ask or measure')}: {a.missing.map((k) => translate(k)).join(', ')}
          </p>
        )}
        <p className="ai-soft assess-meta">
          {translate('Knowledge')} {a.knowledge_release} · {translate('model')} {a.model_version} · {translate('prompt')} {a.prompt_version}
          {a.candidates.length > 0 && ' · ' + translate('rules') + ' ' + a.candidates.map((c) => c.rule_id + ' v' + c.rule_version).join(', ')}
        </p>
      </div>
    </div>
  )
}
