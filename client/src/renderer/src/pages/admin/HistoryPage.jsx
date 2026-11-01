import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { ACTION_TYPES, ACTION_LABEL, ACTION_TONE as TONE, listAuditLogs, exportAuditLogs } from '../../api/auditApi'

// Nhật ký hoạt động trên server (US09). Với bệnh nhân / lượt khám chỉ ghi tên trường thay đổi, không ghi giá trị (Quy định v5 §7).
const PAGE = 50
const EMPTY = { username: '', action_type: '', target_entity: '', from: '', to: '' }
const when = (iso) => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'medium' })
const changes = (x) => {
  const keys = [...new Set([...Object.keys(x.old_values ?? {}), ...Object.keys(x.new_values ?? {})])]
  return keys.length ? keys.join(', ') : ''
}

export default function HistoryPage() {
  const { showToast } = useToast()
  const [draft, setDraft] = useState(EMPTY)
  const [filters, setFilters] = useState(EMPTY)
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    setErr('')
    listAuditLogs(filters, PAGE, page * PAGE).then(setData, (e) => setErr(e.message))
  }, [filters, page])

  const apply = () => {
    setPage(0)
    setFilters(draft)
  }
  async function download(format) {
    try {
      const r = await exportAuditLogs(filters, format)
      showToast(r.truncated ? translate('Exported — cut at 50,000 rows; narrow the filters to get the rest') : translate('Exported'))
    } catch (e) {
      showToast(e.message, 'error')
    }
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Activity history</h1>
          <p>Who did what and when — sign-ins, record views, changes, approvals and AI assessments. Entries can never be edited or deleted.</p>
        </div>
        <div className="ai-toolbar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => download('xlsx')}>
            <Icon name="download" /> Export Excel
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => download('csv')}>
            <Icon name="download" /> Export CSV
          </button>
        </div>
      </div>

      <div className="card">
        <div className="form-grid cols-4">
          <div className="field">
            <label>Account</label>
            <input value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} placeholder="vd: bs01" />
          </div>
          <div className="field">
            <label>Action</label>
            <select value={draft.action_type} onChange={(e) => setDraft({ ...draft, action_type: e.target.value })}>
              <option value="">All</option>
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a}>
                  {translate(ACTION_LABEL[a])}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>From</label>
            <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </div>
          <div className="field">
            <label>Object (table)</label>
            <input value={draft.target_entity} onChange={(e) => setDraft({ ...draft, target_entity: e.target.value })} placeholder="vd: visit, patient, invoice" />
          </div>
        </div>
        <div className="ai-toolbar" style={{ marginTop: 12 }}>
          <span className="ai-soft ai-small">
            {data ? (
              <>
                <b className="mono">{data.total.toLocaleString('vi-VN')}</b> <span>entries</span>
              </>
            ) : (
              '…'
            )}
          </span>
          <div className="ai-toolbar-right">
            <button className="btn btn-ghost btn-sm" onClick={() => (setDraft(EMPTY), setPage(0), setFilters(EMPTY))}>
              Clear filters
            </button>
            <button className="btn btn-primary btn-sm" onClick={apply}>
              <Icon name="search" /> Filter
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        {err && <div className="kb-error">{err}</div>}
        {!data && !err && <p className="ai-soft">Loading…</p>}
        {data && (
          <div className="ai-table-wrap">
            <table className="dt">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Account</th>
                  <th>Action</th>
                  <th>Object</th>
                  <th>Fields changed</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((x) => (
                  <tr key={x.log_id} onClick={() => setOpen(open === x.log_id ? null : x.log_id)} style={{ cursor: 'pointer' }}>
                    <td className="mono ai-small">{when(x.created_at)}</td>
                    <td>{x.username ?? (x.attempted_username ? <span className="sp-warn">{x.attempted_username}</span> : <span className="ai-soft">—</span>)}</td>
                    <td>
                      <span className={'badge ' + (TONE[x.action_type] ?? '')}>{translate(ACTION_LABEL[x.action_type] ?? x.action_type)}</span>
                    </td>
                    <td className="mono ai-small">
                      {x.target_entity}
                      {open === x.log_id && x.entity_id && <div className="ai-soft">{x.entity_id}</div>}
                    </td>
                    <td className="ai-small">
                      {changes(x) || <span className="ai-soft">—</span>}
                      {open === x.log_id && (x.old_values || x.new_values) && <pre className="kb-json">{JSON.stringify({ old: x.old_values, new: x.new_values }, null, 2)}</pre>}
                    </td>
                    <td className="mono ai-small">{x.ip_address ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.items.length && <p className="ai-soft">No entries match.</p>}
          </div>
        )}
        <div className="ai-toolbar" style={{ marginTop: 10 }}>
          <span className="ai-small ai-soft">
            <span>Page</span> <span className="mono">{page + 1}</span> / <span className="mono">{pages}</span>
          </span>
          <div className="ai-toolbar-right">
            <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              ← Previous
            </button>
            <button className="btn btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
