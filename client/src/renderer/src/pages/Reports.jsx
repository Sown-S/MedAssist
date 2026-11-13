import { useState } from 'react'
import { LoadingBlock, ErrorBlock } from '../components/DataState'
import StatCard from '../components/StatCard'
import LineChart from '../components/LineChart'
import { MiniStat, MiniStats } from '../components/MiniStat'
import Icon from '../components/Icon'
import { useApiData } from '../hooks/useApiData'
import { PERIODS, rangeOf, reportPath, fillDays, vnd, percent } from '../api/reportsApi'
import { translate } from '../i18n'

// Báo cáo vận hành: số liệu tổng hợp chỉ đọc. Precision / Recall không tính ở đây — phòng khám không có nhãn đúng.
function HBar({ label, value, of, text, tone = '' }) {
  const pct = of > 0 ? Math.round((value / of) * 100) : 0
  return (
    <div>
      <div className="l">
        <span>{translate(label)}</span>
        <b>{text ?? pct + '%'}</b>
      </div>
      <div className={'hbar ' + tone}>
        <i style={{ width: pct + '%' }} />
      </div>
    </div>
  )
}

const PERIOD_SUB = { today: 'Today', week: 'This week', month: 'This month' }
const dmy = (iso) => iso.split('-').reverse().join('/')

export default function Reports() {
  const [period, setPeriod] = useState('today')
  const range = rangeOf(period)
  const { data, loading, error } = useApiData(reportPath(range))
  // Hôm nay chỉ có một điểm: biểu đồ doanh thu lấy 7 ngày gần nhất.
  const chartRange = period === 'today' ? rangeOf('7d') : range
  const week = useApiData(period === 'today' ? reportPath(chartRange) : null)
  const byDay = (period === 'today' ? week.data : data)?.revenue?.by_day
  const rev = data?.revenue
  const ai = data?.ai
  const a = ai?.assessments
  const d = ai?.decisions
  const decided = d ? d.accepted_top + d.chose_other + d.no_suggestion : 0
  const sub = translate(PERIOD_SUB[period])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reports &amp; Statistics</h1>
          <p>Revenue, visits and AI module performance</p>
        </div>
        <div className="itabs" role="tablist" style={{ marginBottom: 0 }}>
          {PERIODS.map((p) => (
            <button key={p.key} role="tab" aria-selected={period === p.key} className={'itab' + (period === p.key ? ' active' : '')} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <LoadingBlock text="Loading report..." />}
      {error && <ErrorBlock message={error} />}

      {data && !loading && (
        <>
          <div className="kpis">
            <StatCard icon="users" label="Total visits" value={data.visits.total} />
            <StatCard icon="wallet" label="Revenue" value={vnd(rev.total)} />
            <StatCard icon="siren" tone="r" label="Red-flag referrals" value={data.visits.red_flags} alert={data.visits.red_flags > 0} />
            <StatCard icon="sparkles" label="AI–doctor diagnosis match" value={percent(d.acceptance_rate)} />
          </div>
          <p className="ai-soft" style={{ margin: '-12px 0 18px' }}>
            {sub} · {range[0] === range[1] ? dmy(range[0]) : dmy(range[0]) + ' → ' + dmy(range[1])}
          </p>

          <div className="grid-2e">
            <div className="card">
              <div className="card-title">
                Revenue breakdown <span className="cnt">{rev.invoices_paid} {translate('paid invoices')}</span>
              </div>
              <div className="hbars">
                <HBar label="Consultation" value={Number(rev.consultation)} of={Number(rev.total)} text={vnd(rev.consultation)} />
                <HBar label="Paraclinical" value={Number(rev.paraclinical)} of={Number(rev.total)} text={vnd(rev.paraclinical)} />
                <HBar label="Medication" value={Number(rev.drug)} of={Number(rev.total)} text={vnd(rev.drug)} tone="w" />
              </div>
            </div>
            <div className="card">
              <div className="card-title">
                Revenue by day {period === 'today' && <span className="cnt">{translate('Last 7 days')}</span>}
              </div>
              {byDay ? (
                <LineChart points={fillDays(byDay, chartRange).map((x) => ({ label: x.day, value: x.amt }))} fmt={vnd} />
              ) : (
                <LoadingBlock text="Loading report..." />
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">AI module</div>
            <div className="grid-2e" style={{ marginBottom: 0 }}>
              <div>
                <div className="sec-t">Assessments</div>
                <div className="hbars">
                  <HBar label="Full (rules + model)" value={a.full} of={a.total} />
                  <HBar label="Rule-only (model unavailable)" value={a.rule_only} of={a.total} tone="w" />
                  <HBar label="Failed" value={a.failed} of={a.total} tone="d" />
                  <HBar label="Skipped (red flag)" value={a.skipped} of={a.total} tone="n" />
                </div>
              </div>
              <div>
                <div className="sec-t">Doctors vs suggestions</div>
                <div className="hbars">
                  <HBar label="Accepted top suggestion" value={d.accepted_top} of={decided} />
                  <HBar label="Chose another diagnosis" value={d.chose_other} of={decided} tone="n" />
                  <HBar label="No suggestion shown" value={d.no_suggestion} of={decided} tone="n" />
                </div>
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <MiniStats>
                <MiniStat icon="clock" tone="n" value={a.avg_latency_ms == null ? '—' : (a.avg_latency_ms / 1000).toFixed(1).replace('.', ',') + ' s'} label="Average AI assessment time" />
                <MiniStat icon="fileText" tone="n" value={ai.extractions.completed + ' / ' + ai.extractions.total} label="Free-text extractions completed" />
              </MiniStats>
            </div>
            <p className="note-line">
              <Icon name="alert" />
              <span>Precision, recall and F1 are measured on the frozen test set, not on clinic data.</span>
            </p>
          </div>
        </>
      )}
    </div>
  )
}
