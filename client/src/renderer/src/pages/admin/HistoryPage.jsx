import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { ACTION_TYPES, ACTION_LABEL, ACTION_TONE as TONE, listAuditLogs, exportAuditLogs } from '../../api/auditApi'
import Skeleton from '../../components/Skeleton'
import { ErrorNote } from '../../components/DataState'
import Clip from '../../components/Clip'

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
    <div className="vflow">
      <div className="pg-h">
        <div>
          <h2>Activity history</h2>
          <p>Who did what and when — sign-ins, record views, changes, approvals and AI assessments. Entries can never be edited or deleted.</p>
        </div>
        <div className="act">
          <button className="btn btn-outline" onClick={() => download('xlsx')}>
            <Icon name="download" />
            {translate('Export Excel')}
          </button>
          <button className="btn btn-outline" onClick={() => download('csv')}>
            <Icon name="download" />
            {translate('Export CSV')}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-b">
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <input
              className="input"
              style={{ width: 170, height: 40 }}
              value={draft.username}
              onChange={(e) => setDraft({ ...draft, username: e.target.value })}
              placeholder={translate('Account') + ': vd bs01'}
              aria-label={translate('Account')}
            />
            <select className="select" value={draft.action_type} onChange={(e) => setDraft({ ...draft, action_type: e.target.value })} aria-label={translate('Action')}>
              <option value="">{translate('Action') + ': ' + translate('All')}</option>
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a}>
                  {translate(ACTION_LABEL[a])}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="date"
              style={{ width: 160, height: 40 }}
              title={translate('From')}
              aria-label={translate('From')}
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
            <input
              className="input"
              type="date"
              style={{ width: 160, height: 40 }}
              title={translate('To')}
              aria-label={translate('To')}
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
            <input
              className="input"
              style={{ width: 210, height: 40 }}
              value={draft.target_entity}
              onChange={(e) => setDraft({ ...draft, target_entity: e.target.value })}
              placeholder={translate('Object (table)') + ': visit, patient…'}
              aria-label={translate('Object (table)')}
            />
            <button className="btn btn-ghost btn-sm" onClick={() => (setDraft(EMPTY), setPage(0), setFilters(EMPTY))}>
              {translate('Clear filters')}
            </button>
            <button className="btn btn-primary btn-sm" onClick={apply}>
              <Icon name="search" />
              {translate('Filter')}
            </button>
            <div className="sp" />
            <span className="muted small">
              {data ? (
                <>
                  <b className="num">{data.total.toLocaleString('vi-VN')}</b> <span>entries</span>
                </>
              ) : (
                '…'
              )}
            </span>
          </div>

          <ErrorNote>{err}</ErrorNote>
          {!data && !err && <Skeleton rows={6} cols={5} />}
          {data && (
            <div className="tbl-wrap">
              <table>
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
                      <td className="num">{when(x.created_at)}</td>
                      <td>{x.username ?? (x.attempted_username ? <span className="sp-warn">{x.attempted_username}</span> : <span className="muted">—</span>)}</td>
                      <td>
                        {['low', 'warn'].includes(TONE[x.action_type]) ? (
                          <span className={'badge ' + TONE[x.action_type]}>{translate(ACTION_LABEL[x.action_type] ?? x.action_type)}</span>
                        ) : (
                          translate(ACTION_LABEL[x.action_type] ?? x.action_type)
                        )}
                      </td>
                      <td className="num">
                        {x.target_entity}
                        {open === x.log_id && x.entity_id && <div className="muted">{x.entity_id}</div>}
                      </td>
                      <td className="muted">
                        {changes(x) ? (
                          <Clip lines={2} title={translate('Changed fields')}>
                            {changes(x)}
                          </Clip>
                        ) : (
                          <span className="muted">—</span>
                        )}
                        {open === x.log_id && (x.old_values || x.new_values) && <pre className="kb-json">{JSON.stringify({ old: x.old_values, new: x.new_values }, null, 2)}</pre>}
                      </td>
                      <td className="num">{x.ip_address ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.items.length && <p className="muted">No entries match.</p>}
            </div>
          )}
          <div className="pager">
            <span>
              <span>Page</span> <span className="num">{page + 1}</span> / <span className="num">{pages}</span>
            </span>
            <span className="acts">
              <button className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                {translate('← Previous')}
              </button>
              <button className="btn btn-outline btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
                {translate('Next →')}
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
