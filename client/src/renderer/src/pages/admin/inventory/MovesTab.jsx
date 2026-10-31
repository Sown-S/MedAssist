import { useState } from 'react'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { todayISO } from '../../../api/inventoryStore'
import { MOVE_TYPES, Pager, paginate, exportCsv, fmtDateTime } from './shared'

export function MovesTab({ inv }) {
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
