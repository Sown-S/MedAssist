import { Fragment, useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { useAuth } from '../../context/AuthContext'
import { useInventory, stockOf, todayISO } from '../../api/inventoryStore'
import { Empty } from './ai/ui'
import DrugFormModal from './inventory/DrugFormModal'
import ReceiveModal from './inventory/ReceiveModal'
import StockCardModal from './inventory/StockCardModal'
import {
  STATUS,
  MOVE_TYPES,
  StatusBadges,
  ExpiryCell,
  SortTh,
  Pager,
  paginate,
  exportCsv,
  unitLabel,
  fmtMoney,
  fmtNum,
  fmtDate,
  fmtDateTime
} from './inventory/shared'

const PAGE_SIZE = 10
const GROUPS = [
  { key: 'all', label: 'All groups' },
  { key: 'regular', label: 'Regular' },
  { key: 'controlled', label: 'Controlled' },
  { key: 'essential', label: 'Essential' },
  { key: 'supply', label: 'Medical supplies' }
]
const WINDOWS = [0, 30, 60, 90]

export default function InventoryPage({ onNavigate }) {
  const [tab, setTab] = useState('stock')
  const inv = useInventory()
  const { user } = useAuth()

  return (
    <div>
      <div className="breadcrumb">
        Inventory / <b>Stock &amp; expiry</b>
      </div>
      <div className="page-head">
        <div>
          <h1>Stock &amp; expiry</h1>
          <p>Stock by batch, expiry dates and every stock movement. Drug master data lives in Catalog management › Drugs &amp; supplies.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('drugs')}>
          <Icon name="folder" /> <span>Drug catalog</span>
        </button>
      </div>

      <div className="card">
        <div className="itabs ai-tabs">
          <button className={'itab' + (tab === 'stock' ? ' active' : '')} onClick={() => setTab('stock')}>
            Stock by batch
          </button>
          <button className={'itab' + (tab === 'moves' ? ' active' : '')} onClick={() => setTab('moves')}>
            Stock movements
          </button>
          <button className={'itab' + (tab === 'controlled' ? ' active' : '')} onClick={() => setTab('controlled')}>
            Controlled drugs ledger
          </button>
        </div>
        {tab === 'stock' && <StockTab inv={inv} user={user} onNavigate={onNavigate} />}
        {tab === 'moves' && <MovesTab inv={inv} />}
        {tab === 'controlled' && <ControlledTab inv={inv} />}
      </div>
    </div>
  )
}

// ======================= Tồn theo lô =======================
function StockTab({ inv, user, onNavigate }) {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('all')
  const [status, setStatus] = useState('all')
  const [win, setWin] = useState(0)
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(null)
  const [edit, setEdit] = useState(null)
  const [receive, setReceive] = useState(null)
  const [card, setCard] = useState(null)

  const rows = useMemo(
    () => inv.drugs.map((d) => ({ d, s: stockOf(d, inv.batches) })).filter(({ d, s }) => d.active || s.usable + s.expired > 0),
    [inv]
  )
  const term = q.trim().toLowerCase()
  const filtered = rows.filter(({ d, s }) => {
    if (term && ![d.name, d.ingredient, d.atc].some((x) => (x ?? '').toLowerCase().includes(term))) return false
    if (group === 'essential' ? !d.essential : group === 'supply' ? d.kind !== 'supply' : group !== 'all' && d.group !== group) return false
    if (status !== 'all' && !s.statuses.includes(status)) return false
    if (win && !s.batches.some((b) => b.days >= 0 && b.days <= win)) return false
    return true
  })
  const key = {
    name: ({ d }) => d.name.toLowerCase(),
    usable: ({ s }) => s.usable,
    cover: ({ s }) => s.daysCover ?? Infinity,
    expiry: ({ s }) => s.nextExpiry?.expiry ?? '9999',
    value: ({ s }) => s.value,
    reorder: ({ s }) => s.reorder
  }[sort.key]
  const sorted = [...filtered].sort((a, b) => {
    const x = key(a)
    const y = key(b)
    return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1)
  })
  const pg = paginate(sorted, page, PAGE_SIZE)

  const totals = useMemo(() => {
    const t = { value: 0, low: 0, out: 0, expiredQty: 0, expiredValue: 0, w: { 30: 0, 60: 0, 90: 0 } }
    for (const { d, s } of rows) {
      if (!d.active) continue
      t.value += s.value
      if (s.statuses.includes('low')) t.low++
      if (s.statuses.includes('out')) t.out++
      for (const b of s.batches) {
        if (b.days < 0) {
          t.expiredQty++
          t.expiredValue += b.qty * b.cost
        } else for (const w of [30, 60, 90]) if (b.days <= w) t.w[w]++
      }
    }
    return t
  }, [rows])

  function doExport() {
    exportCsv(
      `stock-${todayISO()}.csv`,
      ['Drug', 'Active ingredient', 'ATC code', 'Unit', 'Usable stock', 'Expired stock', 'Threshold', 'Days of cover', 'Suggested reorder', 'Nearest expiry', 'Purchase price', 'Selling price', 'Stock value', 'Status'],
      sorted.map(({ d, s }) => [
        d.name,
        d.ingredient,
        d.atc,
        translate(unitLabel(d.unit)),
        s.usable,
        s.expired,
        d.threshold,
        s.daysCover ?? '',
        s.reorder || '',
        s.nextExpiry ? fmtDate(s.nextExpiry.expiry) : '',
        d.cost,
        d.price,
        s.value,
        s.statuses.map((x) => translate(STATUS[x].label)).join(' · ')
      ])
    )
  }

  const reset = (fn) => (v) => {
    fn(v)
    setPage(1)
  }

  return (
    <>
      <div className="ai-summary">
        <div className="stat-card">
          <div className="dot" />
          <div>
            <div className="val">{fmtMoney(totals.value)}</div>
            <div className="lbl">Usable stock value (at cost)</div>
          </div>
        </div>
        <button className="stat-card ai-sum-card" onClick={() => reset(setStatus)('low')}>
          <div className={'dot ' + (totals.low ? 'amber' : '')} />
          <div>
            <div className="val">{totals.low}</div>
            <div className="lbl">Below threshold</div>
            {totals.out > 0 && (
              <div className="ai-small ai-soft">
                <span className="mono">{totals.out}</span> <span>out of stock</span>
              </div>
            )}
          </div>
        </button>
        {[30, 60, 90].map((w) => (
          <button key={w} className="stat-card ai-sum-card" onClick={() => reset(setWin)(w)}>
            <div className={'dot ' + (w === 30 && totals.w[30] ? 'red' : totals.w[w] ? 'amber' : '')} />
            <div>
              <div className="val">{totals.w[w]}</div>
              <div className="lbl">
                <span>Batches expiring within</span> <span className="mono">{w}</span> <span>days</span>
              </div>
            </div>
          </button>
        ))}
        <button className="stat-card ai-sum-card" onClick={() => reset(setStatus)('expired')}>
          <div className={'dot ' + (totals.expiredQty ? 'red' : '')} />
          <div>
            <div className="val">{totals.expiredQty}</div>
            <div className="lbl">Expired batches to write off</div>
            {totals.expiredQty > 0 && <div className="ai-small ai-soft mono">{fmtMoney(totals.expiredValue)}</div>}
          </div>
        </button>
      </div>

      <div className="ai-toolbar">
        <div className="ai-search">
          <Icon name="search" />
          <input value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Search by name, active ingredient, ATC code…" />
        </div>
        <div className="ai-toolbar-right">
          <select className="ai-select" value={group} onChange={(e) => reset(setGroup)(e.target.value)}>
            {GROUPS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
          <select className="ai-select" value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
            <option value="all">All statuses</option>
            {['ok', 'low', 'out', 'near', 'expired'].map((k) => (
              <option key={k} value={k}>
                {STATUS[k].label}
              </option>
            ))}
          </select>
          <div className="ai-seg" title="Expiring within">
            {WINDOWS.map((w) => (
              <button key={w} className={win === w ? 'active' : ''} onClick={() => reset(setWin)(w)}>
                {w === 0 ? <span>Any expiry</span> : <span className="mono">≤{w}d</span>}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={doExport}>
            <Icon name="download" /> <span>Export to Excel (CSV)</span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setReceive({})}>
            + Receive stock
          </button>
        </div>
      </div>

      {pg.total === 0 ? (
        <Empty title="No drugs match" text="Try another keyword or filter." />
      ) : (
        <div className="ai-table-wrap">
          <table className="dt inv-table">
            <thead>
              <tr>
                <SortTh k="name" sort={sort} onSort={setSort}>
                  Drug
                </SortTh>
                <th>Unit</th>
                <SortTh k="usable" sort={sort} onSort={setSort} className="num">
                  On hand
                </SortTh>
                <th className="num">Threshold</th>
                <SortTh k="cover" sort={sort} onSort={setSort} className="num">
                  Days of cover
                </SortTh>
                <SortTh k="reorder" sort={sort} onSort={setSort} className="num">
                  Suggested reorder
                </SortTh>
                <SortTh k="expiry" sort={sort} onSort={setSort}>
                  Nearest usable expiry
                </SortTh>
                <SortTh k="value" sort={sort} onSort={setSort} className="num">
                  Stock value
                </SortTh>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.map(({ d, s }) => (
                <Fragment key={d.id}>
                  <tr className={'row-click' + (open === d.id ? ' inv-open' : '') + (!d.active ? ' ai-dim' : '')} onClick={() => setOpen(open === d.id ? null : d.id)}>
                    <td>
                      <div className="inv-drug">
                        <Icon name={open === d.id ? 'chevronDown' : 'chevronRight'} />
                        <div>
                          <b>{d.name}</b>
                          {d.group === 'controlled' && <span className="essential-chip inv-ctrl">Controlled</span>}
                          {d.essential && <span className="essential-chip">Essential</span>}
                          <div className="ai-soft ai-small">
                            {d.ingredient}
                            {d.atc && (
                              <>
                                {' · '}
                                <span className="mono">{d.atc}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{unitLabel(d.unit)}</td>
                    <td className="num">
                      <b className="mono">{fmtNum(s.usable)}</b>
                      {s.expired > 0 && (
                        <div className="ai-small inv-minus">
                          + <span className="mono">{s.expired}</span> <span>expired</span>
                        </div>
                      )}
                    </td>
                    <td className="num mono">{d.threshold}</td>
                    <td className="num">
                      {s.daysCover == null ? (
                        <span className="ai-soft">—</span>
                      ) : (
                        <span className={s.daysCover < 14 ? 'inv-minus' : ''}>
                          <span className="mono">{s.daysCover}</span> <span className="ai-small">days</span>
                        </span>
                      )}
                    </td>
                    <td className="num">{s.reorder ? <b className="mono">{fmtNum(s.reorder)}</b> : <span className="ai-soft">—</span>}</td>
                    <td>
                      <ExpiryCell batch={s.nextExpiry} />
                    </td>
                    <td className="num mono">{fmtMoney(s.value)}</td>
                    <td>
                      <StatusBadges statuses={s.statuses} />
                    </td>
                    <td className="ai-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" title="Receive stock" disabled={!d.active} onClick={() => setReceive(d)}>
                        <Icon name="download" />
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Stock card" onClick={() => setCard(d)}>
                        <Icon name="clipboard" />
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Edit drug information" onClick={() => setEdit(d)}>
                        <Icon name="pencil" />
                      </button>
                    </td>
                  </tr>
                  {open === d.id && (
                    <tr className="inv-batches">
                      <td colSpan={10}>
                        <BatchTable drug={d} stock={s} onReceive={() => setReceive(d)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <Pager {...pg} onPage={setPage} />
        </div>
      )}

      <p className="ai-foot-note">
        <Icon name="repeat" />{' '}
        <span>
          Stock is issued on a FEFO basis (first expired, first out). Expired batches are excluded from “On hand” and can no longer be prescribed or sold.
          Suggested reorder = threshold + 30 days of consumption − usable stock.
        </span>
      </p>

      <DrugFormModal drug={edit} drugs={inv.drugs} user={user} onClose={() => setEdit(null)} />
      <ReceiveModal drug={receive} drugs={inv.drugs} user={user} onClose={() => setReceive(null)} />
      <StockCardModal drug={card} moves={inv.moves} onClose={() => setCard(null)} />
    </>
  )
}

function BatchTable({ drug, stock, onReceive }) {
  return (
    <div className="inv-batch-box">
      <div className="inv-batch-head">
        <b>Batches in stock</b>
        <span className="ai-soft ai-small">
          <span>Usable</span> <b className="mono">{stock.usable}</b> · <span>Expired</span> <b className="mono">{stock.expired}</b> ·{' '}
          <span>Quantities in</span> <b>{unitLabel(drug.unit)}</b>
        </span>
      </div>
      {stock.batches.length === 0 ? (
        <p className="ai-soft">
          <span>No stock.</span>{' '}
          {drug.active && (
            <button className="btn btn-ghost btn-sm" onClick={onReceive}>
              + Receive stock
            </button>
          )}
        </p>
      ) : (
        <table className="dt">
          <thead>
            <tr>
              <th>Lot</th>
              <th>Expiry date</th>
              <th className="num">Remaining</th>
              <th>Received on</th>
              <th className="num">Purchase price</th>
              <th className="num">Value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stock.batches.map((b, i) => (
              <tr key={b.id} className={b.days < 0 ? 'inv-expired' : ''}>
                <td className="mono">
                  {b.lot}
                  {i === stock.batches.findIndex((x) => x.days >= 0) && <span className="badge info inv-fefo">FEFO next</span>}
                </td>
                <td>
                  <ExpiryCell batch={b} />
                </td>
                <td className="num mono">{b.qty}</td>
                <td className="mono">{fmtDate(b.receivedAt)}</td>
                <td className="num mono">{fmtMoney(b.cost)}</td>
                <td className="num mono">{fmtMoney(b.qty * b.cost)}</td>
                <td className="ai-actions">
                  {b.days < 0 ? <span className="badge low">Expired</span> : <span className="badge ok">Usable</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ======================= Nhập / xuất =======================
function MovesTab({ inv }) {
  const [type, setType] = useState('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const name = (id) => inv.drugs.find((d) => d.id === id)?.name ?? id
  const term = q.trim().toLowerCase()
  const list = inv.moves.filter(
    (m) => (type === 'all' || m.type === type) && (!term || [name(m.drugId), m.ref, m.lot, m.by].some((x) => (x ?? '').toLowerCase().includes(term)))
  )
  const pg = paginate(list, page, 15)
  return (
    <>
      <div className="ai-toolbar">
        <div className="ai-seg">
          <button className={type === 'all' ? 'active' : ''} onClick={() => (setType('all'), setPage(1))}>
            All
          </button>
          {Object.entries(MOVE_TYPES).map(([k, v]) => (
            <button key={k} className={type === k ? 'active' : ''} onClick={() => (setType(k), setPage(1))}>
              {v}
            </button>
          ))}
        </div>
        <div className="ai-toolbar-right">
          <div className="ai-search">
            <Icon name="search" />
            <input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Search drug, document, lot, staff…" />
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              exportCsv(
                `stock-moves-${todayISO()}.csv`,
                ['Time', 'Voucher no.', 'Drug', 'Type', 'Lot', 'Quantity', 'Balance', 'By', 'Note'],
                list.map((m) => [fmtDateTime(m.at), m.ref, name(m.drugId), translate(MOVE_TYPES[m.type]), m.lot, m.qty, m.balance, m.by, m.note ? translate(m.note) : ''])
              )
            }
          >
            <Icon name="download" /> <span>Export to Excel (CSV)</span>
          </button>
        </div>
      </div>
      <div className="ai-table-wrap">
        <table className="dt">
          <thead>
            <tr>
              <th>Time</th>
              <th>Voucher no.</th>
              <th>Drug</th>
              <th>Type</th>
              <th>Lot</th>
              <th className="num">Quantity</th>
              <th className="num">Balance</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {pg.rows.map((m) => (
              <tr key={m.id}>
                <td className="mono">{fmtDateTime(m.at)}</td>
                <td className="mono">{m.ref}</td>
                <td>{name(m.drugId)}</td>
                <td>
                  <span className={'badge ' + (m.type === 'in' ? 'ok' : m.type === 'out' ? 'info' : 'warn')}>{MOVE_TYPES[m.type]}</span>
                </td>
                <td className="mono">{m.lot}</td>
                <td className={'mono num ' + (m.qty > 0 ? 'inv-plus' : 'inv-minus')}>
                  {m.qty > 0 ? '+' : ''}
                  {m.qty}
                </td>
                <td className="mono num">{m.balance}</td>
                <td>{m.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager {...pg} onPage={setPage} />
      </div>
    </>
  )
}

// ======================= Sổ theo dõi thuốc kiểm soát đặc biệt =======================
function monthOptions() {
  const out = []
  const d = new Date()
  for (let i = 0; i < 12; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function ControlledTab({ inv }) {
  const controlled = inv.drugs.filter((d) => d.group === 'controlled')
  const [drugId, setDrugId] = useState(controlled[0]?.id ?? '')
  const months = monthOptions()
  const [month, setMonth] = useState('all')
  const drug = controlled.find((d) => d.id === drugId)
  if (!drug) return <Empty title="No controlled drugs in the catalog" text="Mark a drug as specially controlled in the drug catalog." />

  const all = inv.moves.filter((m) => m.drugId === drug.id).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
  const inPeriod = (m) => month === 'all' || m.at.slice(0, 7) === month
  const before = all.filter((m) => month !== 'all' && m.at.slice(0, 7) < month)
  const rows = all.filter(inPeriod)
  const opening = before.reduce((s, m) => s + m.qty, 0)
  const totalIn = rows.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0)
  const totalOut = rows.filter((m) => m.qty < 0).reduce((s, m) => s - m.qty, 0)
  const closing = opening + totalIn - totalOut
  const s = stockOf(drug, inv.batches)

  return (
    <>
      <div className="ai-toolbar">
        <div className="ai-toolbar-right">
          <select className="ai-select" value={drugId} onChange={(e) => setDrugId(e.target.value)}>
            {controlled.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select className="ai-select" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">Entire history</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m.slice(5) + '/' + m.slice(0, 4)}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() =>
            exportCsv(
              `controlled-ledger-${drug.id}-${month}.csv`,
              ['Date', 'Voucher no.', 'Lot', 'Expiry date', 'Stock in', 'Stock out', 'Balance', 'By', 'Note'],
              [
                ['', translate('Opening balance'), '', '', '', '', opening, '', ''],
                ...rows.map((m) => {
                  const b = inv.batches.find((x) => x.id === m.batchId)
                  return [fmtDateTime(m.at), m.ref, m.lot, b ? fmtDate(b.expiry) : '', m.qty > 0 ? m.qty : '', m.qty < 0 ? -m.qty : '', m.balance, m.by, m.note ? translate(m.note) : '']
                }),
                ['', translate('Closing balance'), '', '', totalIn, totalOut, closing, '', '']
              ]
            )
          }
        >
          <Icon name="download" /> <span>Export report (CSV)</span>
        </button>
      </div>

      <div className="ai-kpis">
        <Kpi label="Opening balance" value={opening} />
        <Kpi label="Total received" value={'+' + totalIn} />
        <Kpi label="Issued / written off" value={'−' + totalOut} />
        <Kpi label="Closing balance" value={closing} />
        <Kpi label="Physical stock (all batches)" value={s.usable + s.expired} warn={month === 'all' && closing !== s.usable + s.expired} />
      </div>

      <div className="ai-table-wrap" style={{ marginTop: 12 }}>
        <table className="dt">
          <thead>
            <tr>
              <th>Date</th>
              <th>Voucher no.</th>
              <th>Lot</th>
              <th>Expiry date</th>
              <th className="num">Stock in</th>
              <th className="num">Stock out</th>
              <th className="num">Balance</th>
              <th>By</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            <tr className="inv-ledger-sum">
              <td colSpan={6}>
                <b>Opening balance</b>
              </td>
              <td className="num mono">
                <b>{opening}</b>
              </td>
              <td colSpan={2} />
            </tr>
            {rows.map((m) => {
              const b = inv.batches.find((x) => x.id === m.batchId)
              return (
                <tr key={m.id}>
                  <td className="mono">{fmtDateTime(m.at)}</td>
                  <td className="mono">{m.ref}</td>
                  <td className="mono">{m.lot}</td>
                  <td className="mono">{b ? fmtDate(b.expiry) : '—'}</td>
                  <td className="num mono inv-plus">{m.qty > 0 ? m.qty : ''}</td>
                  <td className="num mono inv-minus">{m.qty < 0 ? -m.qty : ''}</td>
                  <td className="num mono">{m.balance}</td>
                  <td>{m.by}</td>
                  <td className="ai-soft ai-small">{m.note}</td>
                </tr>
              )
            })}
            <tr className="inv-ledger-sum">
              <td colSpan={4}>
                <b>Closing balance</b>
              </td>
              <td className="num mono">{totalIn}</td>
              <td className="num mono">{totalOut}</td>
              <td className="num mono">
                <b>{closing}</b>
              </td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="ai-foot-note">
        <Icon name="alert" />{' '}
        <span>
          The ledger layout and reporting periods must be checked against the current regulations on specially controlled drugs before going live.
        </span>
      </p>
    </>
  )
}

function Kpi({ label, value, warn }) {
  return (
    <div className="stat-card">
      <div className={'dot ' + (warn ? 'red' : '')} />
      <div>
        <div className="val mono">{value}</div>
        <div className="lbl">{label}</div>
      </div>
    </div>
  )
}
