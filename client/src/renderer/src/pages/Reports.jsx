import { useState } from 'react'
import { LoadingBlock, ErrorBlock } from '../components/DataState'
import { useApiData } from '../hooks/useApiData'
import { PERIODS, rangeOf, reportPath, fillDays, vnd, percent } from '../api/reportsApi'
import { translate } from '../i18n'

// Báo cáo vận hành cho Admin (Proposal 6.2): số liệu tổng hợp chỉ đọc, không drill-down, không xuất file.
// Precision / Recall / F1 KHÔNG tính ở đây — phòng khám không có nhãn đúng; đo trên testset v1.0 (evaluation/).
function BarRow({ label, value, of, text, color }) {
  const pct = of > 0 ? Math.round((value / of) * 100) : 0
  return (
    <div className="bar-row">
      <span className="lbl">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: pct + '%', ...(color ? { background: color } : {}) }} />
      </div>
      <span className="num">{text ?? value}</span>
    </div>
  )
}

function Stat({ value, label, amber }) {
  return (
    <div className="stat-card">
      <div className={'dot' + (amber ? ' amber' : '')} />
      <div className="txt">
        <span className="val">{value}</span>
        <span className="lbl">{label}</span>
      </div>
    </div>
  )
}

export default function Reports() {
  const [period, setPeriod] = useState('today')
  const range = rangeOf(period)
  const { data, loading, error } = useApiData(reportPath(range))
  const rev = data?.revenue
  const ai = data?.ai
  const a = ai?.assessments
  const d = ai?.decisions

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reports &amp; Statistics</h1>
          <p>Revenue, visits and AI module performance</p>
        </div>
      </div>

      <div className="report-toolbar">
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <LoadingBlock text="Loading report..." />}
      {error && <ErrorBlock message={error} />}

      {data && !loading && (
        <>
          <div className="stat-bar">
            <Stat value={data.visits.total} label="Total visits" />
            <Stat value={vnd(rev.total)} label="Revenue" />
            <Stat value={data.visits.red_flags} label="Red-flag referrals" amber />
            <Stat value={percent(d.acceptance_rate)} label="AI–doctor diagnosis match" />
          </div>

          <div className="report-grid">
            <div className="card">
              <div className="card-title">
                Revenue breakdown <span className="cnt">{rev.invoices_paid} {translate('paid invoices')}</span>
              </div>
              <BarRow label="Consultation" value={Number(rev.consultation)} of={Number(rev.total)} text={vnd(rev.consultation)} />
              <BarRow label="Paraclinical" value={Number(rev.paraclinical)} of={Number(rev.total)} text={vnd(rev.paraclinical)} />
              <BarRow label="Medication" value={Number(rev.drug)} of={Number(rev.total)} text={vnd(rev.drug)} color="var(--priority)" />
              {period !== 'today' && (
                <>
                  <div className="section-label" style={{ marginTop: 14 }}>
                    Revenue by day
                  </div>
                  {fillDays(rev.by_day, range).map((x) => (
                    <BarRow key={x.day} label={x.day} value={x.amt} of={Math.max(...rev.by_day.map((y) => Number(y.total)), 1)} text={vnd(x.amt)} />
                  ))}
                </>
              )}
            </div>

            <div className="card">
              <div className="card-title">AI module</div>
              <BarRow label="Accepted top suggestion" value={d.accepted_top} of={d.accepted_top + d.chose_other + d.no_suggestion} />
              <BarRow label="Chose another diagnosis" value={d.chose_other} of={d.accepted_top + d.chose_other + d.no_suggestion} />
              <BarRow label="No suggestion shown" value={d.no_suggestion} of={d.accepted_top + d.chose_other + d.no_suggestion} />
              <div className="section-label" style={{ marginTop: 14 }}>
                Assessments
              </div>
              <BarRow label="Full (rules + model)" value={a.full} of={a.total} />
              <BarRow label="Rule-only (model unavailable)" value={a.rule_only} of={a.total} />
              <BarRow label="Failed" value={a.failed} of={a.total} />
              <BarRow label="Skipped (red flag)" value={a.skipped} of={a.total} />
              <div className="pref-row inline">
                <span>Average AI assessment time</span>
                <b>{a.avg_latency_ms == null ? '—' : (a.avg_latency_ms / 1000).toFixed(1) + ' s'}</b>
              </div>
              <div className="pref-row inline">
                <span>Free-text extractions completed</span>
                <b>
                  {ai.extractions.completed} / {ai.extractions.total}
                </b>
              </div>
              <p className="ai-soft" style={{ fontSize: 12.5, marginTop: 10 }}>
                Precision, recall and F1 are measured on the frozen test set, not on clinic data.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
