import { LoadingBlock, ErrorBlock } from '../components/DataState'
import { useApiData } from '../hooks/useApiData'
import Icon from '../components/Icon'


export default function Reports() {
  const { data, loading, error } = useApiData('/reports/summary')

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reports &amp; Statistics</h1>
          <p>Revenue, visits and AI module performance</p>
        </div>
      </div>

      <div className="report-toolbar">
        <select>
          <option>Today</option>
          <option>This week</option>
          <option>This month</option>
        </select>
        <button className="btn btn-ghost btn-sm"><Icon name="download" /> Export to Excel</button>
      </div>

      {loading && <LoadingBlock text="Loading report..." />}
      {error && <ErrorBlock message={error} />}

      {data && (
        <>
          <div className="stat-bar">
            <div className="stat-card">
              <div className="dot" />
              <div className="txt">
                <span className="val">{data.stats.visits}</span>
                <span className="lbl">Total visits</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="dot" />
              <div className="txt">
                <span className="val">{data.stats.revenue}</span>
                <span className="lbl">Today's revenue</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="dot amber" />
              <div className="txt">
                <span className="val">{data.stats.redFlags}</span>
                <span className="lbl">Red-flag referrals</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="dot" />
              <div className="txt">
                <span className="val">{data.stats.aiMatch}</span>
                <span className="lbl">AI–doctor diagnosis match</span>
              </div>
            </div>
          </div>

          <div className="report-grid">
            <div className="card">
              <div className="card-title">Revenue breakdown</div>
              {data.revenue.map((r) => (
                <div className="bar-row" key={r.label}>
                  <span className="lbl">{r.label}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: r.pct + '%', background: r.color }} />
                  </div>
                  <span className="num">{r.amt}</span>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-title">AI module performance (experimental)</div>
              {data.aiPerf.map((r) => (
                <div className="bar-row" key={r.label}>
                  <span className="lbl">{r.label}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: r.pct + '%' }} />
                  </div>
                  <span className="num">{r.num}</span>
                </div>
              ))}
            </div>
          </div>

        </>
      )}
    </div>
  )
}
