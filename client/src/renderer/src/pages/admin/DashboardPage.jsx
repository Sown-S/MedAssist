import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatCard from '../../components/StatCard'
import Icon from '../../components/Icon'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import { useApiData } from '../../hooks/useApiData'
import { listAccounts } from '../../api/accountStore'
import { useInventory, stockOf } from '../../api/inventoryStore'
import { checkHealth } from '../../api/client'
import { getSettings } from '../../api/settingsStore'
import { useBackupLog } from '../../api/backupStore'
import { useActivity } from '../../api/activityStore'
import { rangeOf, reportPath, fillDays, vnd, percent } from '../../api/reportsApi'
import { translate } from '../../i18n'
import { describe, roleLabel, LEVELS } from '../../api/activityMessages'
import { fmtDateTime } from './inventory/shared'

// Cảnh báo kho tính THEO LÔ từ inventoryStore: lô đã hết hạn tách riêng với lô sắp hết hạn.
function buildAlerts(inv, accounts, log) {
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
  // Sự kiện nghiêm trọng trong 7 ngày + đăng nhập thất bại trong 24 giờ.
  const since = (h) => new Date(Date.now() - h * 3600000).toISOString()
  log
    .filter((l) => (l.level === 'critical' && l.at >= since(168)) || (l.action === 'auth.login_failed' && l.at >= since(24)))
    .forEach((l) =>
      alerts.push({ level: 'warning', tag: 'Sensitive', title: describe(l), note: `${fmtDateTime(l.at)} · ${l.actor.name} (${roleLabel(l.actor.role)})`, to: 'history' })
    )
  return alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1))
}

const fmtVnd = (n) => n.toLocaleString('vi-VN') + 'đ'

function RevenueChart({ days }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...days.map((d) => d.amt), 1) // 7 ngày đều chưa thu tiền → cột cao 0, không chia cho 0
  const shown = hover ?? days.length - 1 // mặc định ghi nhãn cho hôm nay

  return (
    <div className="mini-chart" onMouseLeave={() => setHover(null)}>
      {days.map((d, i) => (
        <div
          className={'mini-col' + (i === shown ? ' on' : '')}
          key={d.day}
          onMouseEnter={() => setHover(i)}
          aria-label={`${d.day}: ${fmtVnd(d.amt)}`}
        >
          <span className="mini-val">{i === shown ? fmtVnd(d.amt) : ''}</span>
          <div className="mini-track">
            <div className="mini-bar" style={{ height: Math.round((d.amt / max) * 100) + '%' }} />
          </div>
          <span className="mini-day">{d.day}</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage({ onNavigate }) {
  const navigate = useNavigate()
  // Số liệu hôm nay và doanh thu 7 ngày: GET /reports/summary (số tổng hợp, không có dữ liệu bệnh nhân — Admin xem được).
  // Báo cáo lỗi (VD server cũ chưa có endpoint) → các ô hiện "—" kèm dòng báo, phần còn lại của trang vẫn dùng được.
  const days7 = rangeOf('7d')
  const { data: summary, error: e1 } = useApiData(reportPath(rangeOf('today')))
  const { data: week } = useApiData(reportPath(days7))
  const inv = useInventory()
  const activity = useActivity()
  // Nhật ký mẫu xếp cũ → mới; hoạt động phát sinh trong phiên nối vào cuối (mới nhất).
  const log = activity // mới nhất ở đầu
  const NA = '—'
  const byStatus = summary?.visits.by_status
  const ai = summary?.ai
  const [accounts, setAccounts] = useState(null)
  const [health, setHealth] = useState(null)
  const backup = useBackupLog()[0]
  const backupFresh = !!backup && Date.now() - new Date(backup.at).getTime() < 2 * 86400000
  useEffect(() => {
    listAccounts().then(setAccounts)
    checkHealth().then(setHealth)
  }, [])

  const ready = !!accounts

  const alerts = ready ? buildAlerts(inv, accounts, log) : []
  const recent = ready ? log.slice(0, 6) : []

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Admin home</h1>
          <p>Overview of today's clinic operations</p>
        </div>
      </div>

      {!ready && <LoadingBlock />}
      {e1 && <ErrorBlock message={translate('Could not load today’s figures') + ': ' + e1} />}

      {ready && (
        <>
          <div className="stat-bar">
            <StatCard value={summary?.visits.total ?? NA} label="Visits today" />
            <StatCard value={byStatus ? byStatus.Waiting + byStatus.CheckedIn : NA} label="Waiting for consultation" />
            <StatCard value={byStatus?.Prescribed ?? NA} label="Awaiting payment" />
            <StatCard value={summary ? vnd(summary.revenue.total) : NA} label="Today's revenue" />
            <StatCard value={summary?.visits.red_flags ?? NA} label="Red-flag referrals" />
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
                System status {health?.sample && <span className="cnt">Sample data</span>}
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
              {/* Sao lưu: lấy từ lịch sử sao lưu thật (Cài đặt › Sao lưu), quá 2 ngày chưa sao lưu thì cảnh báo. */}
              <div className="status-row">
                <span className="alert-txt">
                  <b>Last backup</b>
                  <span>{backup ? `${fmtDateTime(backup.at)} · ${backup.by}` : 'No backup on record'}</span>
                </span>
                <span className={'badge ' + (backupFresh ? 'ok' : 'warn')}>{backup ? (backupFresh ? 'Completed' : 'Overdue') : 'None'}</span>
              </div>
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
            <table className="dt">
              <tbody>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Action</th>
                </tr>
                {recent.map((a) => (
                  <tr className={'row-click' + (a.level !== 'info' ? ' row-warn' : '')} key={a.seq} onClick={() => onNavigate('history')}>
                    <td className="mono">{fmtDateTime(a.at)}</td>
                    <td>{a.actor.name}</td>
                    <td>{roleLabel(a.actor.role)}</td>
                    <td>
                      {a.level !== 'info' && <Icon name={LEVELS[a.level].icon} />} {describe(a)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
