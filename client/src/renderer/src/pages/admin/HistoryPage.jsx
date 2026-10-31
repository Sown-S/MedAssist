import { useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import Modal, { ModalHeader } from '../../components/Modal'
import { translate } from '../../i18n'
import { useAuth } from '../../context/AuthContext'
import { useActivity, verifyChain, logEvent } from '../../api/activityStore'
import { getSettings } from '../../api/settingsStore'
import { describe, roleLabel, TYPE_LABEL, LEVELS, TARGET_LABEL, targetPage, targetId } from '../../api/activityMessages'
import { todayISO } from '../../api/inventoryStore'
import { Empty } from './ai/ui'
import { Pager, paginate, exportCsv } from './inventory/shared'
import { DEMO_MODE } from '../../api/client'
import AuditLogLive from './AuditLogLive'

const PAGE_SIZE = 15
const p2 = (n) => String(n).padStart(2, '0')
// Luôn đủ ngày + giờ theo giờ máy: 14/10/2026 15:41:21
function fullTime(iso) {
  const d = new Date(iso)
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
}
const localDay = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
const show = (v) => (v === true ? translate('Yes') : v === false ? translate('No') : typeof v === 'number' ? v.toLocaleString('vi-VN') : String(v))

function LevelTag({ level }) {
  const l = LEVELS[level]
  return (
    <span className={'badge ' + l.cls + ' log-level'}>
      <Icon name={l.icon} /> <span>{l.label}</span>
    </span>
  )
}

// Backend thật: nhật ký audit_log trên server (AuditLogLive). Giả lập: nhật ký hoạt động ghi ở máy này (bên dưới).
export default function HistoryPage(props) {
  return DEMO_MODE ? <HistoryDemo {...props} /> : <AuditLogLive />
}

function HistoryDemo({ onNavigate }) {
  const all = useActivity() // mới nhất ở đầu
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('all')
  const [type, setType] = useState('all')
  const [level, setLevel] = useState('all')
  const [result, setResult] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState(null)
  const chain = useMemo(() => verifyChain(all), [all])

  const term = q.trim().toLowerCase()
  const list = all.filter((e) => {
    if (role !== 'all' && e.actor.role !== role) return false
    if (type !== 'all' && e.type !== type) return false
    if (level === 'alerts' ? e.level === 'info' : level !== 'all' && e.level !== level) return false
    if (result !== 'all' && e.result !== result) return false
    const day = localDay(e.at)
    if (from && day < from) return false
    if (to && day > to) return false
    if (term) {
      const hay = [e.actor.name, e.actor.username, describe(e), e.target?.id, e.target?.label, e.ws, ...Object.values(e.params ?? {}).map(String)].join(' ').toLowerCase()
      if (!hay.includes(term)) return false
    }
    return true
  })
  const pg = paginate(list, page, PAGE_SIZE)
  const reset = (fn) => (v) => (fn(v), setPage(1))
  const since24 = new Date(Date.now() - 86400000).toISOString()
  const stats = {
    today: all.filter((e) => localDay(e.at) === todayISO()).length,
    warning: all.filter((e) => e.level === 'warning').length,
    critical: all.filter((e) => e.level === 'critical').length,
    failed: all.filter((e) => e.action === 'auth.login_failed' && e.at >= since24).length
  }

  function doExport(format) {
    const stamp = todayISO()
    if (format === 'csv')
      exportCsv(
        `nhat-ky-hoat-dong-${stamp}.csv`,
        ['No.', 'Time', 'User', 'Role', 'Action type', 'Severity level', 'Description', 'Object', 'Object ID', 'Before', 'After', 'Result', 'Workstation', 'Action code'],
        list.map((e) => [
          e.seq,
          fullTime(e.at),
          e.actor.name,
          roleLabel(e.actor.role),
          translate(TYPE_LABEL[e.type] ?? e.type),
          translate(LEVELS[e.level].label),
          describe(e),
          e.target ? translate(TARGET_LABEL[e.target.kind] ?? e.target.kind) : '',
          targetId(e.target),
          e.before == null ? '' : show(e.before),
          e.after == null ? '' : show(e.after),
          translate(e.result === 'success' ? 'Success' : 'Failure'),
          e.ws,
          e.action
        ])
      )
    else {
      // Bản sao lưu đầy đủ (kèm chuỗi băm) để nộp / lưu trữ ngoài hệ thống.
      const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), integrity: verifyChain(all), entries: all }, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `nhat-ky-hoat-dong-${stamp}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
    logEvent(user, 'audit.export', { params: { n: format === 'csv' ? list.length : all.length, format: format.toUpperCase() } })
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Activity history</h1>
          <p>Audit log of all staff actions in the system</p>
        </div>
        <div className="ai-toolbar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => doExport('csv')}>
            <Icon name="download" /> <span>Export to Excel (CSV)</span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => doExport('json')}>
            <Icon name="save" /> <span>Full backup (JSON)</span>
          </button>
        </div>
      </div>

      <div className="ai-summary">
        <div className="stat-card">
          <div className="dot" />
          <div>
            <div className="val">{all.length}</div>
            <div className="lbl">Entries</div>
            <div className="ai-small ai-soft">
              <span className="mono">{stats.today}</span> <span>today</span>
            </div>
          </div>
        </div>
        <button className="stat-card ai-sum-card" onClick={() => reset(setLevel)('warning')}>
          <div className="dot amber" />
          <div>
            <div className="val">{stats.warning}</div>
            <div className="lbl">
              <Icon name="alert" /> <span>Warning</span>
            </div>
          </div>
        </button>
        <button className="stat-card ai-sum-card" onClick={() => reset(setLevel)('critical')}>
          <div className={'dot ' + (stats.critical ? 'red' : '')} />
          <div>
            <div className="val">{stats.critical}</div>
            <div className="lbl">
              <Icon name="ban" /> <span>Critical</span>
            </div>
          </div>
        </button>
        <button className="stat-card ai-sum-card" onClick={() => (reset(setResult)('failure'), setType('login'))}>
          <div className={'dot ' + (stats.failed ? 'red' : '')} />
          <div>
            <div className="val">{stats.failed}</div>
            <div className="lbl">Failed sign-ins (24 h)</div>
          </div>
        </button>
        <div className="stat-card" title={chain.ok ? '' : `#${chain.at}`}>
          <div className={'dot ' + (chain.ok ? '' : 'red')} />
          <div>
            <div className="lbl">Log integrity</div>
            {chain.ok ? (
              <div className="log-ok">
                <Icon name="lock" /> <span>Intact — no entry changed or removed</span>
              </div>
            ) : (
              <div className="inv-minus">
                <Icon name="ban" /> <span>Broken at entry</span> <span className="mono">#{chain.at}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="log-filters">
          <div className="ai-search">
            <Icon name="search" />
            <input value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Search user, content, object ID, workstation…" />
          </div>
          <select className="ai-select" value={role} onChange={(e) => reset(setRole)(e.target.value)}>
            <option value="all">All roles</option>
            <option value="admin">Administrator</option>
            <option value="doctor">Doctor</option>
            <option value="reception">Receptionist</option>
          </select>
          <select className="ai-select" value={type} onChange={(e) => reset(setType)(e.target.value)}>
            <option value="all">All action types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select className="ai-select" value={level} onChange={(e) => reset(setLevel)(e.target.value)}>
            <option value="all">All levels</option>
            <option value="alerts">Warnings &amp; critical only</option>
            {Object.entries(LEVELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select className="ai-select" value={result} onChange={(e) => reset(setResult)(e.target.value)}>
            <option value="all">All results</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
          <label className="log-date">
            <span>From</span>
            <input type="date" className="ai-select" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} />
          </label>
          <label className="log-date">
            <span>To</span>
            <input type="date" className="ai-select" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} />
          </label>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setQ('')
              setRole('all')
              setType('all')
              setLevel('all')
              setResult('all')
              setFrom('')
              setTo('')
              setPage(1)
            }}
          >
            Clear filters
          </button>
        </div>

        <div className="log-legend">
          {Object.keys(LEVELS).map((k) => (
            <span key={k}>
              <LevelTag level={k} />
            </span>
          ))}
          <span className="ai-soft ai-small">Newest first · time shown as date and time on this computer</span>
        </div>

        {pg.total === 0 ? (
          <Empty title="No entries match" text="Try another keyword, date range or filter." />
        ) : (
          <div className="ai-table-wrap">
            <table className="dt log-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Severity level</th>
                  <th>User</th>
                  <th>Action type</th>
                  <th>Description</th>
                  <th>Object</th>
                  <th>Before → after</th>
                  <th>Result</th>
                  <th>Workstation</th>
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((e) => (
                  <tr key={e.seq} className={'row-click log-' + e.level} onClick={() => setDetail(e)}>
                    <td className="mono">{fullTime(e.at)}</td>
                    <td>
                      <LevelTag level={e.level} />
                    </td>
                    <td>
                      {e.actor.name}
                      <div className="ai-soft ai-small">{roleLabel(e.actor.role)}</div>
                    </td>
                    <td>
                      <span className="badge">{TYPE_LABEL[e.type] ?? e.type}</span>
                    </td>
                    <td>{describe(e)}</td>
                    <td className="ai-small">
                      {e.target ? (
                        <>
                          <span>{TARGET_LABEL[e.target.kind] ?? e.target.kind}</span> <span className="mono">{targetId(e.target)}</span>
                        </>
                      ) : (
                        <span className="ai-soft">—</span>
                      )}
                    </td>
                    <td className="mono ai-small">{e.before != null || e.after != null ? `${show(e.before ?? '—')} → ${show(e.after ?? '—')}` : ''}</td>
                    <td>{e.result === 'success' ? <span className="badge ok">Success</span> : <span className="badge low">Failure</span>}</td>
                    <td className="mono ai-small">{e.ws}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...pg} onPage={setPage} />
          </div>
        )}
        <p className="ai-foot-note">
          <Icon name="lock" />{' '}
          <span>
            Append-only: no one, including administrators, can edit or delete an entry; each entry is chained to the previous one so any change is detected. Only administrators can
            view this log. Retention:
          </span>{' '}
          <b className="mono">{getSettings().retention.auditYears}</b> <span>years, then archived.</span>{' '}
          <span className="cat-crumb" onClick={() => onNavigate('settings', { tab: 'backup' })}>
            Change in Settings › Backup &amp; retention
          </span>
        </p>
      </div>

      {detail && <Detail e={detail} onClose={() => setDetail(null)} onNavigate={onNavigate} />}
    </div>
  )
}

function Detail({ e, onClose, onNavigate }) {
  const dest = targetPage(e.target)
  // Cặp [nhãn, giá trị] — mỗi giá trị là một phần tử đơn lẻ, không phải danh sách con nên không cần key.
  /* eslint-disable react/jsx-key */
  const rows = [
    ['No.', <span className="mono">#{e.seq}</span>],
    ['Time', <span className="mono">{fullTime(e.at)}</span>],
    ['Severity level', <LevelTag level={e.level} />],
    ['User', <span>{e.actor.name} {e.actor.username && <span className="mono ai-soft">({e.actor.username})</span>}</span>],
    ['Role', <span>{roleLabel(e.actor.role)}</span>],
    ['Action type', <span>{TYPE_LABEL[e.type] ?? e.type}</span>],
    ['Action code', <span className="mono">{e.action}</span>],
    ['Description', <span>{describe(e)}</span>],
    ['Object', e.target ? <span>{TARGET_LABEL[e.target.kind] ?? e.target.kind} · <span className="mono">{targetId(e.target)}</span> {e.target.label && e.target.label !== e.target.id ? '· ' + e.target.label : ''}</span> : '—'],
    ['Before', e.before == null ? '—' : <span className="mono">{show(e.before)}</span>],
    ['After', e.after == null ? '—' : <span className="mono">{show(e.after)}</span>],
    ['Result', e.result === 'success' ? <span className="badge ok">Success</span> : <span className="badge low">Failure</span>],
    ['Workstation', <span className="mono">{e.ws}</span>]
  ]
  /* eslint-enable react/jsx-key */
  const params = Object.entries(e.params ?? {}).filter(([, v]) => v !== '' && v != null)
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Log entry') + ' #' + e.seq} onClose={onClose} />
      <div className="modal-body">
        <table className="dt log-detail">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {params.length > 0 && (
          <>
            <div className="section-label">Parameters</div>
            <table className="dt log-detail">
              <tbody>
                {params.map(([k, v]) => (
                  <tr key={k}>
                    <th className="mono">{k}</th>
                    <td>{show(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="ai-soft ai-small mono">
          hash {e.hash} · prev {e.prev}
        </p>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
        {dest && (
          <button
            className="btn btn-primary"
            onClick={() => {
              onClose()
              onNavigate(dest.page, dest.params ?? null)
            }}
          >
            <Icon name="chevronRight" /> <span>Open related record</span>
          </button>
        )}
      </div>
    </Modal>
  )
}
