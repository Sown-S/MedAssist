import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatCard from '../../components/StatCard'
import Icon from '../../components/Icon'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import { useApiData } from '../../hooks/useApiData'
import { listAccounts } from '../../api/accountStore'
import { useInventory, stockOf } from '../../api/inventoryStore'
import { checkHealth } from '../../api/client'
import { listAuditLogs, ACTION_LABEL, ACTION_TONE } from '../../api/auditApi'
import { getSettings } from '../../api/settingsStore'
import { rangeOf, reportPath, fillDays, vnd, percent } from '../../api/reportsApi'
import { translate } from '../../i18n'
import { fmtDateTime } from './inventory/shared'
import ClusterAlerts from '../../components/ClusterAlerts'
import HomeGreeting from '../../components/HomeGreeting'
import { useAuth } from '../../context/AuthContext'

// by_status chỉ có trạng thái đang có lượt (hôm nay chưa ai check-in thì không có khoá CheckedIn) → thiếu là 0.
export const countOf = (byStatus, ...keys) => keys.reduce((n, k) => n + (Number(byStatus?.[k]) || 0), 0)

// Cảnh báo kho tính theo lô: lô đã hết hạn tách riêng với lô sắp hết hạn.
// failed: đăng nhập thất bại 24 giờ qua trên server, gộp thành một cảnh báo.
function buildAlerts(inv, accounts, failed = []) {
  const { drugs, batches } = inv
  const alerts = []
  drugs
    .filter((d) => d.active)
    .forEach((d) => {
      const s = stockOf(d, batches)
      s.batches.forEach((b) => {
        if (b.days < 0)
          alerts.push({ level: 'critical', tag: 'Expired', title: `${d.name} has expired`, note: `Lot ${b.lot} · ${b.qty} expired — cannot be prescribed`, to: 'inventory' })
        else if (b.days <= getSettings().ops.nearDays)
          alerts.push({ level: 'warning', tag: 'Near expiry', title: `${d.name} expires in ${b.days} days`, note: `Lot ${b.lot} · ${b.qty} left`, to: 'inventory' })
      })
      if (s.usable < d.threshold)
        alerts.push({ level: s.usable === 0 ? 'critical' : 'warning', tag: 'Low stock', title: `${d.name} is below its threshold`, note: `${s.usable} left · threshold ${d.threshold}`, to: 'inventory' })
    })
  const pending = accounts.filter((a) => a.mustChange)
  if (pending.length)
    alerts.push({
      level: 'warning',
      tag: 'Accounts',
      title: `${pending.length} account${pending.length > 1 ? 's have' : ' has'} not changed the temporary password`,
      note: pending.map((a) => a.username).join(', '),
      to: 'staff'
    })
  if (failed.length)
    alerts.push({
      level: 'warning',
      tag: 'Sensitive',
      title: `${failed.length} failed sign-in${failed.length > 1 ? 's' : ''} in the last 24 hours`,
      note: [...new Set(failed.map((x) => x.attempted_username ?? x.username ?? '—'))].join(', '),
      to: 'history'
    })
  return alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1))
}

// Hoạt động gần đây và đăng nhập thất bại lấy từ nhật ký server. Lỗi tải → bảng trống, phần còn lại vẫn dùng được.
const SELF_VIEWS = ['audit_log', 'report']
function useServerLog() {
  const [recent, setRecent] = useState(null)
  const [failed, setFailed] = useState([])
  useEffect(() => {
    // Bỏ lượt xem nhật ký / báo cáo do chính trang Admin tự sinh — che mất hoạt động thật.
    listAuditLogs({}, 50, 0).then(
      (d) => setRecent(d.items.filter((x) => !(x.action_type === 'VIEW' && SELF_VIEWS.includes(x.target_entity))).slice(0, 6)),
      () => setRecent([])
    )
    const since = Date.now() - 86400000
    const from = new Date(since).toLocaleDateString('sv-SE')
    listAuditLogs({ action_type: 'LOGIN_FAILED', from }, 200, 0).then(
      (d) => setFailed(d.items.filter((x) => new Date(x.created_at).getTime() >= since)),
      () => {}
    )
  }, [])
  return { recent, failed }
}

function ServerActivity({ items, onOpen }) {
  return (
    <table className="dt">
      <tbody>
        <tr>
          <th>Time</th>
          <th>Account</th>
          <th>Action</th>
          <th>Object</th>
        </tr>
        {(items ?? []).map((x) => (
          <tr className="row-click" key={x.log_id} onClick={onOpen}>
            <td className="mono">{fmtDateTime(x.created_at)}</td>
            <td>{x.username ?? x.attempted_username ?? '—'}</td>
            <td>
              <span className={'badge ' + (ACTION_TONE[x.action_type] ?? '')}>{translate(ACTION_LABEL[x.action_type] ?? x.action_type)}</span>
            </td>
            <td className="mono ai-small">{x.target_entity ?? '—'}</td>
          </tr>
        ))}
        {items && !items.length && (
          <tr>
            <td colSpan="4" className="ai-soft">
              No activity recorded yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

const fmtVnd = (n) => n.toLocaleString('vi-VN') + 'đ'

// Doanh thu 7 ngày dạng đường (kiểu biểu đồ chứng khoán): điểm cuối nổi bật, rê chuột vào điểm để xem số.
function RevenueChart({ days }) {
  const [hover, setHover] = useState(null)
  const vals = days.map((d) => d.amt)
  const max = Math.max(...vals, 1) * 1.1 // 7 ngày đều chưa thu tiền → không chia cho 0
  const n = days.length
  const x = (i) => (n > 1 ? (i / (n - 1)) * 100 : 50)
  const y = (v) => (1 - v / max) * 100
  const line = days.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(2) + ' ' + y(d.amt).toFixed(2)).join(' ')
  const last = vals[n - 1] ?? 0
  const prev = vals[n - 2] ?? 0
  const diff = last - prev
  const shown = hover ?? n - 1
  return (
    <div className="lc-wrap">
      <div className="lc-h">
        <b className="mono">{fmtVnd(last)}</b>
        {n > 1 && (
          <span className={'lc-d ' + (diff >= 0 ? 'up' : 'down')}>
            <Icon name="trending" />
            {(diff >= 0 ? '+' : '−') + fmtVnd(Math.abs(diff))}
          </span>
        )}
        <span className="ai-soft">{translate('compared with the day before')}</span>
      </div>
      <div className="lc" onMouseLeave={() => setHover(null)}>
        <div className="lc-grid">
          <i />
          <i />
          <i />
          <i />
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1877F2" stopOpacity=".22" />
              <stop offset="1" stopColor="#1877F2" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={line + ' L100 100 L0 100 Z'} fill="url(#lcg)" />
          <path d={line} className="lc-l" vectorEffect="non-scaling-stroke" />
        </svg>
        {days.map((d, i) => (
          <span
            key={d.day}
            className={'lc-p' + (i === n - 1 ? ' last' : '') + (i === shown ? ' on' : '')}
            style={{ left: x(i) + '%', top: y(d.amt) + '%' }}
            onMouseEnter={() => setHover(i)}
            aria-label={d.day + ': ' + fmtVnd(d.amt)}
          >
            {i === shown && <em>{fmtVnd(d.amt)}</em>}
          </span>
        ))}
      </div>
      <div className="lc-x">
        {days.map((d) => (
          <span key={d.day}>{d.day}</span>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage({ onNavigate }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  // Số liệu tổng hợp, không có dữ liệu bệnh nhân nên Admin xem được. Lỗi tải → các ô hiện “—”, phần còn lại vẫn dùng được.
  const days7 = rangeOf('7d')
  const { data: summary, error: e1 } = useApiData(reportPath(rangeOf('today')))
  const { data: week } = useApiData(reportPath(days7))
  const inv = useInventory()
  const NA = '—'
  const byStatus = summary?.visits.by_status
  const ai = summary?.ai
  const [accounts, setAccounts] = useState(null)
  const [accountsError, setAccountsError] = useState('')
  const [health, setHealth] = useState(null)
  useEffect(() => {
    // Không đọc được tài khoản (mất kết nối, server lỗi) thì vẫn hiện phần còn lại, kèm thông báo, thay vì tải mãi.
    listAccounts().then(setAccounts, (e) => {
      setAccounts([])
      setAccountsError(e.message)
    })
    checkHealth().then(setHealth)
  }, [])

  const ready = !!accounts

  const server = useServerLog()
  const alerts = ready ? buildAlerts(inv, accounts, server.failed) : []

  return (
    <div>
      <HomeGreeting crumb="Admin" name={user?.name ?? ''}>
        <button className="btn btn-ghost" onClick={() => navigate('/reports')}>
          <Icon name="chartLine" /> View reports
        </button>
        <button className="btn btn-primary" onClick={() => onNavigate('staff')}>
          <Icon name="userPlus" /> Create account
        </button>
      </HomeGreeting>

      <div className="bell-stack">
        <ClusterAlerts onOpenReport={() => navigate('/reports')} />
      </div>
      {!ready && <LoadingBlock />}
      {e1 && <ErrorBlock message={translate('Could not load today’s figures') + ': ' + e1} />}
      {accountsError && <ErrorBlock message={translate('Could not load staff accounts') + ': ' + translate(accountsError)} />}

      {ready && (
        <>
          <div className="kpis k5">
            <StatCard value={summary?.visits.total ?? NA} label="Visits today" icon="users" onClick={() => navigate('/reports')} />
            <StatCard value={byStatus ? countOf(byStatus, 'Waiting', 'CheckedIn') : NA} label="Waiting for consultation" icon="clock" tone="g" />
            <StatCard value={byStatus ? countOf(byStatus, 'Prescribed') : NA} label="Awaiting payment" icon="banknote" />
            <StatCard value={summary ? vnd(summary.revenue.total) : NA} label="Today's revenue" icon="wallet" />
            <StatCard value={summary?.visits.red_flags ?? NA} label="Red-flag referrals" icon="siren" tone="r" alert={summary?.visits.red_flags > 0} />
          </div>

          <div className="dash-grid">
            <div className="card">
              <div className="card-title">
                Needs attention <span className="cnt">{alerts.length}</span>
              </div>
              {alerts.length === 0 && <p className="dash-empty">Nothing needs your attention right now.</p>}
              {alerts.map((a, i) => (
                <button className="alert-row" key={i} onClick={() => onNavigate(a.to)}>
                  <span className={'alert-ic ' + a.level}>
                    <Icon name={a.level === 'critical' ? 'ban' : 'alert'} />
                  </span>
                  <span className="alert-txt">
                    <b>{a.title}</b>
                    <span>{a.note}</span>
                  </span>
                  <span className={'badge ' + (a.level === 'critical' ? 'low' : 'warn')}>{a.tag}</span>
                  <Icon name="chevronRight" />
                </button>
              ))}
            </div>

            <div className="card">
              <div className="card-title">
                System status
                <span className="dash-link" onClick={() => onNavigate('settings', { tab: 'connection' })}>
                  Settings <Icon name="chevronRight" />
                </span>
              </div>
              {!health && <p className="dash-empty">Checking connection…</p>}
              {health?.services.map((s) => (
                <div className="status-row" key={s.key}>
                  <span className="alert-txt">
                    <b>{s.name}</b>
                    <span>{s.detail}</span>
                  </span>
                  <span className={'badge ' + (s.ok ? 'ok' : s.ok === null ? 'muted' : 'low')}>{s.state}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="dash-grid">
            <div className="card dash-click" onClick={() => navigate('/reports')} title="Open Reports">
              <div className="card-title">
                Revenue — last 7 days
                <span className="dash-link">
                  View reports <Icon name="chevronRight" />
                </span>
              </div>
              {week ? <RevenueChart days={fillDays(week.revenue.by_day, days7)} /> : <p className="ai-soft">Not available — could not load the report.</p>}
            </div>

            <div className="dash-stack">
              <div className="card">
                <div className="card-title">AI decision support</div>
                {ai ? (
                  <>
                    <div className="ai-metric">
                      <span className="val">{percent(ai.decisions.acceptance_rate)}</span>
                      <span>of AI suggestions matched the doctor's confirmed diagnosis</span>
                    </div>
                    <div className="bar-track" style={{ flex: 'none', margin: '10px 0 12px' }}>
                      <div className="bar-fill" style={{ width: percent(ai.decisions.acceptance_rate ?? 0) }} />
                    </div>
                    <div className="pref-row inline">
                      <span>AI assessments today</span>
                      <b>{ai.assessments.total}</b>
                    </div>
                    <div className="pref-row inline">
                      <span>Rule-only results (model unavailable)</span>
                      <b>{ai.assessments.rule_only}</b>
                    </div>
                  </>
                ) : (
                  <p className="ai-soft">Not available — could not load the report.</p>
                )}
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => onNavigate('ai')}>
                  Open AI configuration
                </button>
              </div>

              <div className="card">
                <div className="card-title">Shortcuts</div>
                <div className="shortcut-grid">
                  <button className="btn btn-ghost" onClick={() => onNavigate('staff')}>
                    <Icon name="users" /> Create account
                  </button>
                  <button className="btn btn-ghost" onClick={() => onNavigate('inventory')}>
                    <Icon name="box" /> Stock in
                  </button>
                  <button className="btn btn-ghost" onClick={() => navigate('/reports')}>
                    <Icon name="chart" /> View reports
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Recent activity</div>
            <ServerActivity items={server.recent} onOpen={() => onNavigate('history')} />
            <div style={{ textAlign: 'right', marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('history')}>
                View full history →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
