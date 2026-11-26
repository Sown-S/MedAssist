import { Fragment, useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import Icon from '../../components/Icon'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { ACTION_TYPES, ACTION_LABEL, ACTION_TONE as TONE, listAuditLogs, exportAuditLogs } from '../../api/auditApi'
import Skeleton from '../../components/Skeleton'
import { ErrorNote } from '../../components/DataState'
import Clip from '../../components/Clip'
import DateField from '../../components/DateField'
import { fmtNum, fmtDateTime } from '../../utils/format'
import { useServerDrugs } from '../../api/serverDrugs'

// Nhật ký hoạt động trên server (US09). Với bệnh nhân / lượt khám chỉ ghi tên trường thay đổi, không ghi giá trị (Quy định v5 §7).
const PAGE = 50
const EMPTY = { username: '', action_type: '', target_entity: '', from: '', to: '' }
const when = (iso) => fmtDateTime(iso, { seconds: true })
const changes = (x) => {
  const keys = [...new Set([...Object.keys(x.old_values ?? {}), ...Object.keys(x.new_values ?? {})])]
  return keys.length ? keys.join(', ') : ''
}

// Giá trị trong phần chi tiết: drug_id hiện thành tên thuốc (kèm hàm lượng) thay cho chuỗi mã; số/chuỗi giữ nguyên.
const show = (key, v, drugName) => {
  if (v === null || v === undefined || v === '') return '—'
  if (key === 'drug_id' && drugName(v)) return drugName(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
const FIELD_LABEL = { drug_id: 'Drug' }

// Phần chi tiết của một dòng: bảng Trường | Trước | Sau, trải hết chiều ngang bảng.
function AuditDetail({ x, drugName }) {
  const keys = [...new Set([...Object.keys(x.old_values ?? {}), ...Object.keys(x.new_values ?? {})])]
  const target = x.target_entity === 'drug' && drugName(x.entity_id)
  return (
    <div className="audit-detail">
      {(target || x.entity_id) && (
        <p className="muted small">
          <span>{translate('Record')}:</span> <b className={target ? '' : 'num'}>{target || x.entity_id}</b>
        </p>
      )}
      {keys.length > 0 && (
        <table className="audit-kv">
          <thead>
            <tr>
              <th>{translate('Field')}</th>
              <th>{translate('Before')}</th>
              <th>{translate('After')}</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <td>{FIELD_LABEL[k] ? `${translate(FIELD_LABEL[k])} (${k})` : k}</td>
                <td>{x.old_values ? show(k, x.old_values[k], drugName) : '—'}</td>
                <td>{x.new_values ? show(k, x.new_values[k], drugName) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function HistoryPage() {
  const { showToast } = useToast()
  const [draft, setDraft] = useState(EMPTY)
  const [filters, setFilters] = useState(EMPTY)
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null)
  const { drugs } = useServerDrugs()
  const drugById = useMemo(() => new Map(drugs.map((d) => [d.id, d.name])), [drugs])
  const drugName = (id) => drugById.get(id)

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
          <Button className="btn btn-outline" onClick={() => download('xlsx')}>
            <Icon name="download" />
            {translate('Export Excel')}
          </Button>
          <Button className="btn btn-outline" onClick={() => download('csv')}>
            <Icon name="download" />
            {translate('Export CSV')}
          </Button>
        </div>
      </div>

      <div className="card">
        <div className="card-b">
          <div className="toolbar mb-14">
            <input
              className="input w-170 h-40"
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
            <DateField style={{ width: 160 }} title={translate('From')} aria-label={translate('From')} placeholder={translate('From')} value={draft.from} onChange={(v) => setDraft({ ...draft, from: v })} />
            <DateField style={{ width: 160 }} title={translate('To')} aria-label={translate('To')} placeholder={translate('To')} value={draft.to} onChange={(v) => setDraft({ ...draft, to: v })} />
            <input
              className="input w-210 h-40"
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
                  <b className="num">{fmtNum(data.total)}</b> <span>entries</span>
                </>
              ) : (
                '…'
              )}
            </span>
          </div>

          <ErrorNote>{err}</ErrorNote>
          {!data && !err && <Skeleton rows={6} cols={5} />}
          {data && (
            <div className="tbl-wrap" tabIndex={0}>
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
                    <Fragment key={x.log_id}>
                      <tr
                        className={'pointer' + (open === x.log_id ? ' on' : '')}
                        tabIndex={0}
                        onClick={() => setOpen(open === x.log_id ? null : x.log_id)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(open === x.log_id ? null : x.log_id))}
                      >
                        <td className="num">{when(x.created_at)}</td>
                        <td>{x.username ?? (x.attempted_username ? <span className="sp-warn">{x.attempted_username}</span> : <span className="muted">—</span>)}</td>
                        <td>
                          {['low', 'warn'].includes(TONE[x.action_type]) ? (
                            <span className={'badge ' + TONE[x.action_type]}>{translate(ACTION_LABEL[x.action_type] ?? x.action_type)}</span>
                          ) : (
                            translate(ACTION_LABEL[x.action_type] ?? x.action_type)
                          )}
                        </td>
                        <td className="num">{x.target_entity}</td>
                        <td className="muted">
                          {changes(x) ? (
                            <Clip lines={2} title={translate('Changed fields')}>
                              {changes(x)}
                            </Clip>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="num">{x.ip_address ?? '—'}</td>
                      </tr>
                      {open === x.log_id && (x.entity_id || x.old_values || x.new_values) && (
                        <tr className="audit-open">
                          <td colSpan={6}>
                            <AuditDetail x={x} drugName={drugName} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
