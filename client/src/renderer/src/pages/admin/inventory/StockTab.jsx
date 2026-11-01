import { Fragment, useMemo, useState } from 'react'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { stockOf, todayISO } from '../../../api/inventoryStore'
import { Empty } from '../ui'
import DrugFormModal from './DrugFormModal'
import ReceiveModal from './ReceiveModal'
import StockCardModal from './StockCardModal'
import { STATUS, StatusBadges, ExpiryCell, SortTh, Pager, paginate, exportCsv, unitLabel, fmtMoney, fmtNum, fmtDate } from './shared'

export const PAGE_SIZE = 10

export const GROUPS = [
  { key: 'all', label: 'All groups' },
  { key: 'regular', label: 'Regular' },
  { key: 'controlled', label: 'Controlled' },
  { key: 'essential', label: 'Essential' },
  { key: 'supply', label: 'Medical supplies' }
]

export const WINDOWS = [0, 30, 60, 90]

export function StockTab({ inv, user }) {
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
      <ReceiveModal drug={receive} drugs={inv.drugs} onClose={() => setReceive(null)} />
      <StockCardModal drug={card} moves={inv.moves} onClose={() => setCard(null)} />
    </>
  )
}

export function BatchTable({ drug, stock, onReceive }) {
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
