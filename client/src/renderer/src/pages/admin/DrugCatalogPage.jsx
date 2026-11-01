import { useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useInventory, stockOf, setDrugActive, todayISO } from '../../api/inventoryStore'
import { ConfirmDialog, Empty } from './ui'
import DrugFormModal from './inventory/DrugFormModal'
import { SortTh, Pager, paginate, exportCsv, unitLabel, fmtMoney, fmtNum } from './inventory/shared'

// Danh mục thuốc là dữ liệu gốc; tồn kho theo lô, nhập / xuất nằm ở Tồn kho & hạn dùng.
export default function DrugCatalogPage({ params, onNavigate }) {
  const inv = useInventory()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [q, setQ] = useState(params?.q ?? '')
  const [kind, setKind] = useState('all')
  const [active, setActive] = useState('active')
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState(null)
  const [toggle, setToggle] = useState(null)

  const rows = useMemo(() => inv.drugs.map((d) => ({ d, s: stockOf(d, inv.batches) })), [inv])
  const term = q.trim().toLowerCase()
  const filtered = rows.filter(({ d }) => {
    if (term && ![d.name, d.ingredient, d.atc].some((x) => (x ?? '').toLowerCase().includes(term))) return false
    if (kind === 'essential' ? !d.essential : kind === 'controlled' ? d.group !== 'controlled' : kind !== 'all' && d.kind !== kind) return false
    if (active !== 'all' && d.active !== (active === 'active')) return false
    return true
  })
  const key = {
    name: ({ d }) => d.name.toLowerCase(),
    atc: ({ d }) => d.atc || 'ZZZ',
    price: ({ d }) => d.price,
    stock: ({ s }) => s.usable
  }[sort.key]
  const sorted = [...filtered].sort((a, b) => {
    const x = key(a)
    const y = key(b)
    return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1)
  })
  const pg = paginate(sorted, page, 10)
  const missingAtc = inv.drugs.filter((d) => d.active && d.kind === 'drug' && !d.atc).length

  return (
    <div>
      <div className="breadcrumb">
        Catalog management / <b>Medical catalogs</b> / Drugs &amp; supplies
      </div>
      <div className="page-head">
        <div>
          <h1>Drugs &amp; supplies</h1>
          <p>Master data shared by prescribing and invoices. Stock levels are in Inventory › Stock &amp; expiry.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('inventory')}>
          <Icon name="box" /> <span>Stock &amp; expiry</span>
        </button>
      </div>

      {missingAtc > 0 && (
        <div className="warn-banner show caution" style={{ marginTop: 0, marginBottom: 12 }}>
          <div className="icon">
            <Icon name="alert" />
          </div>
          <div className="txt">
            <b>
              <span className="mono">{missingAtc}</span> <span>drugs have no ATC code</span>
            </b>
            Antibiotics among them are not recognised as prescription-only.
          </div>
        </div>
      )}

      <div className="card">
        <div className="ai-toolbar">
          <div className="ai-search">
            <Icon name="search" />
            <input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Search by name, active ingredient, ATC code…" />
          </div>
          <div className="ai-toolbar-right">
            <select className="ai-select" value={kind} onChange={(e) => (setKind(e.target.value), setPage(1))}>
              <option value="all">Drugs &amp; supplies</option>
              <option value="drug">Drugs only</option>
              <option value="supply">Medical supplies only</option>
              <option value="essential">Essential</option>
              <option value="controlled">Controlled</option>
            </select>
            <select className="ai-select" value={active} onChange={(e) => (setActive(e.target.value), setPage(1))}>
              <option value="active">In use</option>
              <option value="inactive">Discontinued</option>
              <option value="all">All</option>
            </select>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                exportCsv(
                  `drug-catalog-${todayISO()}.csv`,
                  ['Code', 'Name', 'Type', 'Active ingredient', 'ATC code', 'Unit', 'Purchase price', 'Selling price', 'Essential', 'Controlled', 'Status'],
                  sorted.map(({ d }) => [
                    d.id,
                    d.name,
                    translate(d.kind === 'drug' ? 'Medicine' : 'Medical supply'),
                    d.ingredient,
                    d.atc,
                    translate(unitLabel(d.unit)),
                    d.cost,
                    d.price,
                    d.essential ? translate('Yes') : '',
                    d.group === 'controlled' ? translate('Yes') : '',
                    translate(d.active ? 'In use' : 'Discontinued')
                  ])
                )
              }
            >
              <Icon name="download" /> <span>Export to Excel (CSV)</span>
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setEdit({})}>
              + Add drug
            </button>
          </div>
        </div>

        {pg.total === 0 ? (
          <Empty title="No drugs match" text="Try another keyword or filter." />
        ) : (
          <div className="ai-table-wrap">
            <table className="dt">
              <thead>
                <tr>
                  <th>Code</th>
                  <SortTh k="name" sort={sort} onSort={setSort}>
                    Name
                  </SortTh>
                  <th>Active ingredient</th>
                  <SortTh k="atc" sort={sort} onSort={setSort}>
                    ATC code
                  </SortTh>
                  <th>Unit</th>
                  <th className="num">Purchase price</th>
                  <SortTh k="price" sort={sort} onSort={setSort} className="num">
                    Selling price
                  </SortTh>
                  <th>Flags</th>
                  <SortTh k="stock" sort={sort} onSort={setSort} className="num">
                    On hand
                  </SortTh>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pg.rows.map(({ d, s }) => (
                  <tr key={d.id} className={'row-click' + (!d.active ? ' ai-dim' : '')} onClick={() => setEdit(d)}>
                    <td className="mono">{d.id}</td>
                    <td>
                      <b>{d.name}</b>
                      {d.kind === 'supply' && <div className="ai-soft ai-small">Medical supply</div>}
                    </td>
                    <td>{d.ingredient || <span className="ai-soft">—</span>}</td>
                    <td className="mono">{d.atc || <span className="ai-soft">—</span>}</td>
                    <td>{unitLabel(d.unit)}</td>
                    <td className="num mono">{fmtMoney(d.cost)}</td>
                    <td className="num mono">{fmtMoney(d.price)}</td>
                    <td>
                      {d.essential && <span className="essential-chip">Essential</span>}
                      {d.group === 'controlled' && <span className="essential-chip inv-ctrl">Controlled</span>}
                    </td>
                    <td className="num mono">{fmtNum(s.usable)}</td>
                    <td>{d.active ? <span className="badge ok">In use</span> : <span className="badge muted">Discontinued</span>}</td>
                    <td className="ai-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setEdit(d)}>
                        <Icon name="pencil" />
                      </button>
                      <button className="btn btn-ghost btn-sm" title={d.active ? 'Discontinue' : 'Re-activate'} onClick={() => setToggle({ d, s })}>
                        <Icon name={d.active ? 'ban' : 'repeat'} />
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
          <Icon name="help" />{' '}
          <span>Selling prices here fill invoices automatically; ATC codes mark antibiotics (J01) as prescription-only; the essential flag drives the checkout warning.</span>
        </p>
      </div>

      <DrugFormModal drug={edit} drugs={inv.drugs} user={user} onClose={() => setEdit(null)} />
      <ConfirmDialog
        open={!!toggle}
        title={toggle ? translate(toggle.d.active ? 'Discontinue drug' : 'Re-activate drug') + ' · ' + toggle.d.name : ''}
        message={
          toggle?.d.active
            ? toggle.s.usable + toggle.s.expired > 0
              ? 'This drug still has stock. Once discontinued it can no longer be prescribed or received; remaining stock stays visible until written off or adjusted.'
              : 'The drug can no longer be prescribed or received. History is kept.'
            : 'The drug can be prescribed and received again.'
        }
        confirmLabel={toggle?.d.active ? 'Discontinue' : 'Re-activate'}
        danger={toggle?.d.active}
        onConfirm={async () => {
          const r = await setDrugActive(toggle.d.id, !toggle.d.active)
          if (r?.ok === false) return showToast(translate(r.error))
          showToast(toggle.d.active ? 'Drug discontinued' : 'Drug re-activated')
          setToggle(null)
        }}
        onCancel={() => setToggle(null)}
      />
    </div>
  )
}
