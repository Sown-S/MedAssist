import { ExpiryCell, unitLabel, fmtMoney, fmtDate } from './shared'

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
