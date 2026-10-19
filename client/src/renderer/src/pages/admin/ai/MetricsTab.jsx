import { useMemo, useState } from 'react'
import Icon from '../../../components/Icon'
import { RULE_TYPES, DISMISS_REASONS, fmtPct } from './catalog'
import { prf } from './ruleEngine'
import { TypeBadge, IcdCell } from './ui'

// Số liệu lấy từ phản hồi của bác sĩ trên từng gợi ý (chấp nhận / bỏ qua + lý do) và
// đối chiếu với chẩn đoán cuối cùng đã xác nhận (để tính bỏ sót — FN).
const sum = (list, k) => list.reduce((s, r) => s + (r.stats[k] ?? 0), 0)
const HIGH_DISMISS = 0.4

export default function MetricsTab({ rules }) {
  const [type, setType] = useState('all')
  const scoped = rules.filter((r) => r.version > 0 && (type === 'all' || r.type === type))
  const total = useMemo(() => {
    const t = { fired: sum(scoped, 'fired'), accepted: sum(scoped, 'accepted'), dismissed: sum(scoped, 'dismissed') }
    return { ...t, ...prf({ tp: sum(scoped, 'tp'), fp: sum(scoped, 'fp'), fn: sum(scoped, 'fn') }) }
  }, [scoped])
  const reasons = DISMISS_REASONS.map((d) => ({ ...d, n: scoped.reduce((s, r) => s + (r.stats.reasons?.[d.key] ?? 0), 0) }))
  const maxReason = Math.max(1, ...reasons.map((r) => r.n))
  const rows = [...scoped].sort((a, b) => b.stats.fired - a.stats.fired)

  return (
    <>
      <div className="ai-toolbar">
        <div className="ai-seg">
          <button className={type === 'all' ? 'active' : ''} onClick={() => setType('all')}>
            All
          </button>
          {RULE_TYPES.map((t) => (
            <button key={t.key} className={type === t.key ? 'active' : ''} onClick={() => setType(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <span className="ai-soft ai-small">Last 30 days · from doctors' accept/dismiss feedback</span>
      </div>

      <div className="ai-kpis">
        <Kpi label="Times fired" value={total.fired} />
        <Kpi label="Accepted by doctors" value={fmtPct(total.fired ? total.accepted / total.fired : NaN)} />
        <Kpi label="Precision" value={fmtPct(total.precision)} hint="TP / (TP + FP)" />
        <Kpi label="Recall" value={fmtPct(total.recall)} hint="TP / (TP + FN)" />
        <Kpi label="F1" value={fmtPct(total.f1)} hint="2·P·R / (P + R)" />
      </div>
      <p className="ai-hint">
        <Icon name="help" />{' '}
        <span>
          TP = suggestion accepted and matches the confirmed diagnosis · FP = suggestion dismissed · FN = confirmed diagnosis the rule should have
          suggested but did not. Same definitions as the evaluation section of the Proposal.
        </span>
      </p>

      <div className="ai-metrics-grid">
        <div className="card">
          <div className="card-title">Per-rule effectiveness</div>
          <div className="ai-table-wrap">
            <table className="dt">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Result</th>
                  <th>Fired</th>
                  <th>Accepted / dismissed</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>F1</th>
                  <th>Top dismiss reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = r.stats
                  const m = prf(s)
                  const accRate = s.fired ? s.accepted / s.fired : 0
                  const top = Object.entries(s.reasons ?? {}).sort((a, b) => b[1] - a[1])[0]
                  const flag = s.fired >= 10 && 1 - accRate > HIGH_DISMISS
                  return (
                    <tr key={r.id} className={r.retired || !r.enabled ? 'ai-dim' : ''}>
                      <td className="mono">{r.id}</td>
                      <td>
                        <TypeBadge type={r.type} />
                      </td>
                      <td>
                        <IcdCell code={r.icd} />
                      </td>
                      <td className="mono">{s.fired}</td>
                      <td>
                        <div className="ai-split" title={`${s.accepted} / ${s.dismissed}`}>
                          <div className="acc" style={{ width: accRate * 100 + '%' }} />
                          <div className="dis" style={{ width: (s.fired ? (1 - accRate) * 100 : 0) + '%' }} />
                        </div>
                        <span className="mono ai-small">
                          {s.accepted} / {s.dismissed}
                        </span>{' '}
                        {flag && <span className="badge low">Review rule</span>}
                      </td>
                      <td className="mono">{fmtPct(m.precision)}</td>
                      <td className="mono">{fmtPct(m.recall)}</td>
                      <td className="mono">{fmtPct(m.f1)}</td>
                      <td className="ai-small">
                        {top ? (
                          <>
                            <span>{DISMISS_REASONS.find((d) => d.key === top[0])?.label}</span> <span className="mono ai-soft">({top[1]})</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Dismiss reasons</div>
          {reasons.map((r) => (
            <div className="bar-row" key={r.key}>
              <span className="lbl">{r.label}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: (r.n / maxReason) * 100 + '%', background: 'var(--priority)' }} />
              </div>
              <span className="num">{r.n}</span>
            </div>
          ))}
          <p className="ai-hint">Rules with more than 40% dismissals (and at least 10 firings) are marked “Review rule”.</p>
        </div>
      </div>
    </>
  )
}

function Kpi({ label, value, hint }) {
  return (
    <div className="stat-card">
      <div className="dot" />
      <div>
        <div className="val">{value}</div>
        <div className="lbl">{label}</div>
        {hint && <div className="ai-soft ai-small mono">{hint}</div>}
      </div>
    </div>
  )
}
