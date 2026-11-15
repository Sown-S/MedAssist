import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { getAssessment, missingName } from '../../api/clinicApi'

// Chưa có kết quả (đang tải, hoặc lượt chưa được đánh giá — 404).
const EMPTY = { assessment_id: null, ai_status: 'Pending', mode: null, knowledge_release: null, model_version: null, prompt_version: null, priority: null, alerts: [], complete_now: [], candidates: [] }

// Kết quả AI của lượt khám (GET /visits/{id}/assessment, 404 = chưa được đánh giá), hỏi lại mỗi 2 giây tới khi có kết quả cuối.
export function useAssessment(visit) {
  const [a, setA] = useState(EMPTY)
  const done = ['Ready', 'Degraded', 'Failed', 'Skipped', 'None'].includes(a.ai_status)
  useEffect(() => {
    if (done) return
    const tick = () => getAssessment(visit.id).then((r) => setA(r ?? { ...EMPTY, ai_status: 'None' }), () => {})
    tick()
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
// Bố cục theo mẫu: hàng gợi ý (tối đa 3) nằm ngang; bằng chứng, giải thích và phần "còn chưa rõ" mở bằng nút Bằng chứng.
const UNKNOWN_SHOWN = 6

export default function AssessmentCard({ a, decisions, onAccept, onDismiss }) {
  const [dismissing, setDismissing] = useState(null)
  const [open, setOpen] = useState(false)
  const st = STATUS[a.ai_status]
  const hasDetail = a.candidates.length > 0 || a.complete_now.length > UNKNOWN_SHOWN
  const unknown = open ? a.complete_now : a.complete_now.slice(0, UNKNOWN_SHOWN)
  return (
    <div className={'ai' + (open ? ' open' : '')}>
      <div className="ai-h">
        <Icon name="sparkles" />
        <b>{translate('Reference suggestion')}</b>
        <span className={'badge ' + st.tone}>{translate(st.label)}</span>
        {a.knowledge_release && (
          <span className="plain">
            {translate('based on knowledge')} {a.knowledge_release}
          </span>
        )}
        <span className="note warn">· {translate('AI suggestions are for reference only — the doctor decides.')}</span>
        {hasDetail && (
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
            <Icon name="list-checks" />
            {translate('Evidence')}
          </button>
        )}
      </div>
      {a.ai_status === 'Degraded' && (
        <p className="hint-w">
          <Icon name="alert" /> {translate('The AI model is unavailable — candidates below are ranked by the approved rules only, without an AI explanation.')}
        </p>
      )}
      {a.ai_status === 'Skipped' && (
        <p className="hint-w">
          <Icon name="ban" /> {translate('A red-flag rule matched — the pipeline stopped before the AI model, so no diagnosis is suggested. Assess and refer if needed.')}
        </p>
      )}
      {a.ai_status === 'Failed' && (
        <p className="hint-w">
          <Icon name="alert" /> {translate('The AI assessment could not be completed — examine and diagnose as usual.')}
        </p>
      )}
      {a.ai_status === 'Pending' && <p className="muted small" style={{ marginTop: 8 }}>{translate('Waiting for the result — you can keep examining; it appears here automatically.')}</p>}
      {a.ai_status === 'Preliminary' && <p className="muted small" style={{ marginTop: 8 }}>{translate('Preliminary ranking by the approved rules — the AI explanation will appear here automatically.')}</p>}

      {a.candidates.length > 0 && (
        <div className="sugs">
          {a.candidates.map((c, i) => (
            <div className={'sug' + (decisions[c.condition_code] === 'accepted' ? ' on' : '')} key={c.condition_code}>
                <span className="rk">{c.rank}</span>
                <span className="nm">
                  <b title={c.name_vi}>{c.name_vi}</b>
                  {c.icd10_code && <span>{'ICD-10 ' + c.icd10_code}</span>}
                </span>
                <span className="pc num" title={translate('Match score')}>
                  {Math.round(c.score * 100)}%
                </span>
              <div className="acts">
                {decisions[c.condition_code] === 'accepted' ? (
                  <span className="badge b-success">{translate('Accepted')}</span>
                ) : decisions[c.condition_code] === 'dismissed' ? (
                  <span className="badge b-neutral">{translate('Dismissed')}</span>
                ) : dismissing === c.condition_code ? (
                  <select
                    className="input"
                    defaultValue=""
                    autoFocus
                    onBlur={() => setDismissing(null)}
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
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => onAccept(c)} title={i === 0 ? 'Alt+D' : undefined}>
                      <Icon name="check" /> <span>{translate('Accept')}</span>
                      {i === 0 && <kbd>Alt+D</kbd>}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDismissing(c.condition_code)}>
                      <Icon name="x" /> <span>{translate('Dismiss')}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {a.candidates.length > 0 && (
        <div className="ev-wrap">
        <div>
        <div className="ev-grid">
          {a.candidates.map((c) => (
            <div className="ev-col" key={c.condition_code}>
              <b>{c.name_vi}</b>
              {c.supporting.map((s) => (
                <div key={'s' + s.symptom_code} className="ev s" title={translate('Supporting finding')}>
                  <Icon name="circle-check" /> {s.symptom_name}
                </div>
              ))}
              {c.contradicting.map((s) => (
                <div key={'c' + s.symptom_code} className="ev c" title={translate('Contradicting finding')}>
                  <Icon name="circle-x" /> {s.symptom_name}
                </div>
              ))}
              {c.missing.map((s) => (
                <div key={'m' + s.symptom_code} className="ev m" title={translate('Not yet known')}>
                  <Icon name="circle-help" /> {translate('Missing')}: {s.symptom_name}
                </div>
              ))}
              {c.explanation && <p className="ai-why">{c.explanation}</p>}
            </div>
          ))}
        </div>
        </div>
        </div>
      )}

      {['Ready', 'Degraded'].includes(a.ai_status) && !a.candidates.length && (
        <p className="muted small" style={{ marginTop: 8 }}>{translate('No condition in the approved knowledge base matches the symptoms recorded at check-in.')}</p>
      )}
      {a.complete_now.length > 0 && (
        <p className="hint-w">
          <b>{translate('Still unknown — ask or measure')}:</b> {unknown.map(missingName).join(', ')}
          {!open && a.complete_now.length > UNKNOWN_SHOWN && (
            <button className="link-btn" onClick={() => setOpen(true)}>
              {' '}
              +{a.complete_now.length - UNKNOWN_SHOWN} {translate('more')}
            </button>
          )}
        </p>
      )}
      {open && (
        <p className="muted small" style={{ marginTop: 8 }}>
          {translate('Knowledge')} {a.knowledge_release ?? '—'} · {translate('model')} {a.model_version ?? '—'} · {translate('prompt')} {a.prompt_version ?? '—'}
        </p>
      )}
    </div>
  )
}
