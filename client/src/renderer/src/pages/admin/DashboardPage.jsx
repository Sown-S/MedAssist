import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatCard from '../../components/StatCard'
import Icon from '../../components/Icon'
import BellPortal from '../../components/BellPortal'
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
import LineChart from '../../components/LineChart'
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
        if (b.days < 0) alerts.push({ level: 'critical', tag: 'Expired', title: `${d.name} has expired`, note: `Lot ${b.lot} · ${b.qty} expired — cannot be prescribed`, to: 'inventory' })
        else if (b.days <= getSettings().ops.nearDays)
          alerts.push({ level: 'warning', tag: 'Near expiry', title: `${d.name} expires in ${b.days} days`, note: `Lot ${b.lot} · ${b.qty} left`, to: 'inventory' })
      })
      if (s.usable < d.threshold)
        alerts.push({
          level: s.usable === 0 ? 'critical' : 'warning',
          tag: 'Low stock',
          title: `${d.name} is below its threshold`,
          note: `${s.usable} left · threshold ${d.threshold}`,
          to: 'inventory'
        })
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
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Account</th>
            <th>Action</th>
            <th>Object</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((x) => (
            <tr className="clickable" key={x.log_id} onClick={onOpen}>
              <td className="num">{fmtDateTime(x.created_at)}</td>
              <td>{x.username ?? x.attempted_username ?? '—'}</td>
              <td>
                <span className={'badge ' + (ACTION_TONE[x.action_type] ?? '')}>{translate(ACTION_LABEL[x.action_type] ?? x.action_type)}</span>
              </td>
              <td className="muted">{x.target_entity ?? '—'}</td>
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

  const ALERT_ICON = { inventory: 'package-x', staff: 'key-round', history: 'shield-alert' }
  return (
    <>
      <div className="rhome" style={{ flex: 'none' }}>
        <HomeGreeting crumb="Admin" name={user?.name ?? ''}>
          <button className="btn btn-outline" onClick={() => navigate('/reports')}>
            <Icon name="chart-line" />
            {translate('View reports')}
          </button>
          <button className="btn btn-primary" onClick={() => onNavigate('staff')}>
            <Icon name="user-plus" />
            {translate('Create account')}
          </button>
        </HomeGreeting>
      </div>

      <BellPortal>
        <ClusterAlerts onOpenReport={() => navigate('/reports')} />
      </BellPortal>
      {!ready && <LoadingBlock />}
      {e1 && <ErrorBlock message={translate('Could not load today’s figures') + ': ' + e1} />}
      {accountsError && <ErrorBlock message={translate('Could not load staff accounts') + ': ' + translate(accountsError)} />}

      {ready && (
        <>
          <div className="kpis tiles4 ak">
            <StatCard value={summary?.visits.total ?? NA} label="Visits today" icon="users" onClick={() => navigate('/reports')} />
            <StatCard value={byStatus ? countOf(byStatus, 'Waiting', 'CheckedIn') : NA} label="Waiting for consultation" icon="clock" tone="g" />
            <StatCard value={byStatus ? countOf(byStatus, 'Prescribed') : NA} label="Awaiting payment" icon="banknote" />
            <StatCard value={summary?.visits.red_flags ?? NA} label="Red-flag referrals" icon="ambulance" tone="r" alert={summary?.visits.red_flags > 0} />
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-h">
                <h3>Needs attention</h3>
                {alerts.length > 0 && <span className="plain">{alerts.length}</span>}
              </div>
              <div className="card-b">
                {alerts.length === 0 ? (
                  <div className="empty">
                    <div className="ill">
                      <Icon name="circle-check-big" />
                    </div>
                    <b>Nothing needs your attention right now.</b>
                  </div>
                ) : (
                  <div className="rows">
                    {alerts.map((a, i) => (
                      <div className="r" key={i}>
                        <div className={'ico ' + (a.level === 'critical' ? 'd' : a.to === 'inventory' ? 'w' : 'n')}>
                          <Icon name={a.level === 'critical' && a.to === 'inventory' ? 'package-x' : a.tag === 'Near expiry' ? 'calendar-clock' : (ALERT_ICON[a.to] ?? 'triangle-alert')} />
                        </div>
                        <div className="t">
                          <b>{translate(a.title)}</b>
                          <span>{translate(a.note)}</span>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate(a.to)}>
                          {translate('Open →')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-h">
                <h3>System status</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('settings', { tab: 'connection' })}>
                  {translate('Settings')}
                </button>
              </div>
              <div className="card-b">
                {!health && <p className="muted small">{translate('Checking connection…')}</p>}
                <div className="rows">
                  {health?.services.map((s) => (
                    <div className="r" key={s.key}>
                      <div className="ico n">
                        <Icon name={s.key === 'ai' || s.key === 'llm' ? 'cpu' : s.key === 'db' ? 'database' : 'server'} />
                      </div>
                      <div className="t">
                        <b>{s.name}</b>
                        <span>{s.detail}</span>
                      </div>
                      {s.ok ? <span className="plain">{s.state}</span> : <span className={'badge ' + (s.ok === null ? 'b-neutral' : 'b-danger')}>{s.state}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-h">
                <h3>Revenue — last 7 days</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/reports')}>
                  {translate('View reports')}
                </button>
              </div>
              <div className="card-b">
                {week ? (
                  <LineChart points={fillDays(week.revenue.by_day, days7).map((x) => ({ label: x.day, value: x.amt }))} fmt={vnd} height={190} />
                ) : (
                  <p className="muted small">{translate('Not available — could not load the report.')}</p>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-h">
                <h3>AI decision support</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('ai')}>
                  {translate('Open AI configuration')}
                </button>
              </div>
              <div className="card-b">
                {ai ? (
                  <div className="rows">
                    <div className="r">
                      <div className="t">
                        <span>{translate('AI assessments today')}</span>
                        <b style={{ fontSize: 'var(--fs-lg)' }}>{ai.assessments.total}</b>
                      </div>
                    </div>
                    <div className="r">
                      <div className="t">
                        <span>{translate('Rule-only results (model unavailable)')}</span>
                        <b style={{ fontSize: 'var(--fs-lg)' }}>{ai.assessments.rule_only}</b>
                      </div>
                    </div>
                    <div className="r">
                      <div className="t">
                        <span>{translate("of AI suggestions matched the doctor's confirmed diagnosis")}</span>
                        <b style={{ fontSize: 'var(--fs-lg)' }}>{percent(ai.decisions.acceptance_rate)}</b>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="muted small">{translate('Not available — could not load the report.')}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-h">
                <h3>Recent activity</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('history')}>
                  {translate('View full history →')}
                </button>
              </div>
              <div className="card-b">
                <ServerActivity items={server.recent} onOpen={() => onNavigate('history')} />
              </div>
            </div>
            <div className="card">
              <div className="card-h">
                <h3>Shortcuts</h3>
              </div>
              <div className="card-b quick q2s">
                {[
                  ['user-plus', 'Create account', 'Receptionist, doctor or administrator', () => onNavigate('staff')],
                  ['package-plus', 'Stock in', 'Add a new drug batch', () => onNavigate('inventory')],
                  ['library', 'Catalog management', 'Drugs, services, lab tests', () => onNavigate('catalog')],
                  ['brain', 'AI configuration', 'Rules and thresholds', () => onNavigate('ai')]
                ].map(([icon, t, sub, run]) => (
                  <button key={t} className="qa qv" onClick={run}>
                    <div className="ico p">
                      <Icon name={icon} />
                    </div>
                    <div>
                      <b>{translate(t)}</b>
                      <span>{translate(sub)}</span>
                    </div>
                    <Icon name="arrow-up-right" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
