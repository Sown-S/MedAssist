import { useState } from 'react'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import { useInventory } from '../../../api/inventoryStore'
import { ConfirmDialog, Empty } from '../ui'
import { Pager, paginate, fmtDate, fmtDateTime } from '../inventory/shared'
import { SCHEMAS, optLabel } from './schemas'
import { useLiveCatalog, setLiveActive } from '../../../api/serviceCatalogLive'
import { RowForm } from './RowForm'
import { exportCatalog } from './catalogCsv'

export default function CatalogDetailPage({ catalogKey, params, onNavigate }) {
  const s = SCHEMAS[catalogKey]
  // Dịch vụ, Xét nghiệm, Gói khám đọc / ghi qua server.
  const lc = useLiveCatalog(true)
  const cats = { services: lc.services, labs: lc.labs, packages: lc.packages }
  // Server không lưu ngày hiệu lực của giá → bỏ cột “Giá áp dụng từ”.
  const columns = s.columns.filter((c) => c.key !== 'priceHistory')
  const inv = useInventory()
  const { user } = useAuth()
  const { showToast } = useToast()
  const all = cats[catalogKey] ?? []
  const [q, setQ] = useState(params?.q ?? '')
  const [status, setStatus] = useState('active')
  const [sub, setSub] = useState('all')
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState(params?.openId ? all.find((r) => r.id === params.openId) ?? null : null)
  const [toggle, setToggle] = useState(null)

  const term = q.trim().toLowerCase()
  const list = all
    .filter((r) => (status === 'all' ? true : status === 'active' ? r.active : !r.active))
    .filter((r) => !s.filter || sub === 'all' || r[s.filter.field] === sub)
    .filter((r) => !term || Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(term)))
    .sort((a, b) => a.code.localeCompare(b.code, 'vi', { numeric: true }))
  const pg = paginate(list, page, 15)
  const lastUpdate = all.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), '')
  const reset = (fn) => (v) => (fn(v), setPage(1))


  return (
    <div>
      <div className="breadcrumb">
        <span className="cat-crumb" onClick={() => onNavigate('catalog')}>
          Catalog management
        </span>{' '}
        / <b>{s.title}</b>
      </div>
      <div className="page-head">
        <div>
          <h1>{s.title}</h1>
          <p>{s.desc}</p>
        </div>
        <div className="ai-soft ai-small">
          <span>Last updated</span> <span className="mono">{fmtDateTime(lastUpdate)}</span>
        </div>
      </div>


      <div className="card">
        <div className="ai-toolbar">
          <div className="ai-search">
            <Icon name="search" />
            <input value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Search code or name…" />
          </div>
          <div className="ai-toolbar-right">
            {s.filter && (
              <select className="ai-select" value={sub} onChange={(e) => reset(setSub)(e.target.value)}>
                <option value="all">All groups</option>
                {s.filter.options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <div className="ai-seg">
              {[
                ['active', 'In use'],
                ['inactive', 'Discontinued'],
                ['all', 'All']
              ].map(([k, l]) => (
                <button key={k} className={status === k ? 'active' : ''} onClick={() => reset(setStatus)(k)}>
                  {l}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => exportCatalog(catalogKey, list)}>
              <Icon name="download" /> <span>Export</span>
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setEdit({})}>
              + Add
            </button>
          </div>
        </div>

        {lc.error && <div className="warn-banner show danger">{lc.error}</div>}
        {!lc.loaded ? (
          <p className="ai-soft">{translate('Loading the catalog…')}</p>
        ) : pg.total === 0 ? (
          <Empty title="No records match" text="Try another keyword or filter, or import the list from a file." />
        ) : (
          <div className="ai-table-wrap">
            <table className="dt">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  {columns.map((c) => (
                    <th key={c.key} className={c.num ? 'num' : ''}>
                      {c.label}
                    </th>
                  ))}
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((r) => (
                  <tr key={r.id} className={'row-click' + (r.active ? '' : ' ai-dim')} onClick={() => setEdit(r)}>
                    <td className="mono">{r.code}</td>
                    <td>
                      <b>{r.name}</b>
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className={c.num ? 'num' : ''}>
                        {c.render ? c.render(r, cats, inv, c.key) : r[c.key] || <span className="ai-soft">—</span>}
                      </td>
                    ))}
                    <td>{r.active ? <span className="badge ok">In use</span> : <span className="badge muted">Discontinued</span>}</td>
                    <td className="ai-small">
                      <span className="mono">{fmtDate(r.updatedAt)}</span>
                      <div className="ai-soft">{r.updatedBy}</div>
                    </td>
                    <td className="ai-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setEdit(r)}>
                        <Icon name="pencil" />
                      </button>
                      <button className="btn btn-ghost btn-sm" title={r.active ? 'Discontinue' : 'Re-activate'} onClick={() => setToggle(r)}>
                        <Icon name={r.active ? 'ban' : 'repeat'} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...pg} onPage={setPage} />
          </div>
        )}
        <p className="ai-foot-note">
          <Icon name="lock" />{' '}
          <span>Records are never deleted — discontinued codes stay readable on old records and invoices. Every change is written to the activity history.</span>
        </p>
      </div>

      {edit && <RowForm catalogKey={catalogKey} row={edit} all={all} cats={cats} inv={inv} user={user} onClose={() => setEdit(null)} />}
      <ConfirmDialog
        open={!!toggle}
        title={toggle ? translate(toggle.active ? 'Discontinue' : 'Re-activate') + ' · ' + toggle.code + ' ' + toggle.name : ''}
        message={toggle?.active ? 'The code can no longer be chosen for new records. Existing records keep it.' : 'The code can be chosen again.'}
        confirmLabel={toggle?.active ? 'Discontinue' : 'Re-activate'}
        danger={toggle?.active}
        onConfirm={async () => {
          const r = await setLiveActive(catalogKey, toggle.id, !toggle.active)
          if (!r.ok) return showToast(translate(r.error), 'error')
          showToast(toggle.active ? 'Record discontinued' : 'Record re-activated')
          setToggle(null)
        }}
        onCancel={() => setToggle(null)}
      />
    </div>
  )
}

export { optLabel }

