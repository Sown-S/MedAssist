import { useState } from 'react'
import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { stockOf } from '../../../api/inventoryStore'
import { Empty } from '../ui'
import { exportCsv, fmtDate, fmtDateTime } from './shared'

export function monthOptions() {
  const out = []
  const d = new Date()
  for (let i = 0; i < 12; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export function ControlledTab({ inv }) {
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

export function Kpi({ label, value, warn }) {
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
