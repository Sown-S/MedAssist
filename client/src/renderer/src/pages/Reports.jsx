import { useState } from 'react'
import { LoadingBlock, ErrorBlock } from '../components/DataState'
import { Kpi } from '../components/StatCard'
import LineChart from '../components/LineChart'
import { MiniStat, MiniStats } from '../components/MiniStat'
import Icon from '../components/Icon'
import { useApiData } from '../hooks/useApiData'
import { PERIODS, rangeOf, reportPath, fillDays, percent } from '../api/reportsApi'
import { translate } from '../i18n'
import { vnd, fmtDate } from '../utils/format'

// Báo cáo vận hành: số liệu tổng hợp chỉ đọc. Precision / Recall không tính ở đây — phòng khám không có nhãn đúng.
function HBar({ label, value, of, text, tone = '' }) {
  const pct = of > 0 ? Math.round((value / of) * 100) : 0
  return (
    <div>
      <div className="l">
        <span>{translate(label)}</span>
        <b className="num">{text ?? pct + '%'}</b>
      </div>
      <div className={'hbar ' + tone}>
        <i style={{ width: pct + '%' }} />
      </div>
    </div>
  )
}

const PERIOD_SUB = { today: 'Today', week: 'This week', month: 'This month' }

export default function Reports() {
  const [period, setPeriod] = useState('today')
  const range = rangeOf(period)
  const { data, loading, error, reload } = useApiData(reportPath(range))
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

  const when = sub + ' · ' + (range[0] === range[1] ? fmtDate(range[0]) : fmtDate(range[0]) + ' → ' + fmtDate(range[1]))
  return (
    <div className="content view">
      <div className="pg-h">
        <div>
          <h2>Reports &amp; Statistics</h2>
          <p>Revenue, visits and AI module performance</p>
        </div>
        <div className="act">
          <div className="period">
            <div className="seg" role="tablist">
              {PERIODS.map((p) => (
                <button key={p.key} role="tab" aria-selected={period === p.key} className={period === p.key ? 'on' : ''} onClick={() => setPeriod(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} onRetry={reload} />}

      {data && !loading && (
        <>
          <div className="kpis">
            <Kpi c="p" icon="users" label="Total visits" value={data.visits.total} go={when} />
            <Kpi c="n" icon="wallet" label="Revenue" value={vnd(rev.total)} go={when} />
            <Kpi c="d" icon="ambulance" label="Red-flag referrals" value={data.visits.red_flags} go={when} alert={data.visits.red_flags > 0} />
            <Kpi c="p" icon="brain" label="AI–doctor diagnosis match" value={percent(d.acceptance_rate)} go={when} />
          </div>

          <div className="grid-2e">
            <div className="card">
              <div className="card-h">
                <h3>Revenue breakdown</h3>
                <span className="plain">
                  {rev.invoices_paid} {translate('paid invoices')}
                </span>
              </div>
              <div className="card-b bars">
                <HBar label="Consultation" value={Number(rev.consultation)} of={Number(rev.total)} text={vnd(rev.consultation)} />
                <HBar label="Paraclinical" value={Number(rev.paraclinical)} of={Number(rev.total)} text={vnd(rev.paraclinical)} />
                <HBar label="Medication" value={Number(rev.drug)} of={Number(rev.total)} text={vnd(rev.drug)} tone="w" />
              </div>
            </div>
            <div className="card">
              <div className="card-h">
                <h3>Revenue by day</h3>
                {period === 'today' && <span className="plain">{translate('Last 7 days')}</span>}
              </div>
              <div className="card-b">
                {byDay ? <LineChart points={fillDays(byDay, chartRange).map((x) => ({ label: x.day, value: x.amt }))} fmt={vnd} height={220} /> : <LoadingBlock />}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>AI module</h3>
            </div>
            <div className="card-b">
              <div className="grid-2e">
                <div>
                  <div className="sec-t">Assessments</div>
                  <div className="bars">
                    <HBar label="Full (rules + model)" value={a.full} of={a.total} />
                    <HBar label="Rule-only (model unavailable)" value={a.rule_only} of={a.total} tone="w" />
                    <HBar label="Failed" value={a.failed} of={a.total} tone="d" />
                    <HBar label="Skipped (red flag)" value={a.skipped} of={a.total} tone="n" />
                  </div>
                </div>
                <div>
                  <div className="sec-t">Doctors vs suggestions</div>
                  <div className="bars">
                    <HBar label="Accepted top suggestion" value={d.accepted_top} of={decided} />
                    <HBar label="Chose another diagnosis" value={d.chose_other} of={decided} tone="n" />
                    <HBar label="No suggestion shown" value={d.no_suggestion} of={decided} tone="n" />
                  </div>
                </div>
              </div>
              <div className="mt-18">
                <MiniStats>
                  <MiniStat icon="clock" tone="n" value={a.avg_latency_ms == null ? '—' : (a.avg_latency_ms / 1000).toFixed(1).replace('.', ',') + ' s'} label="Average AI assessment time" />
                  <MiniStat icon="fileText" tone="n" value={ai.extractions.completed + ' / ' + ai.extractions.total} label="Free-text extractions completed" />
                </MiniStats>
              </div>
              <p className="muted small mt-12">
                <Icon name="info" /> <span>Precision, recall and F1 are measured on the frozen test set, not on clinic data.</span>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
