import { ExpiryCell, unitLabel, fmtMoney, fmtDate } from './shared'

export function BatchTable({ drug, stock, onReceive }) {
  return (
    <div className="inv-batch-box">
      <div className="inv-batch-head">
        <b>Batches in stock</b>
        <span className="muted small">
          <span>Usable</span> <b className="num">{stock.usable}</b> · <span>Expired</span> <b className="num">{stock.expired}</b> ·{' '}
          <span>Quantities in</span> <b>{unitLabel(drug.unit)}</b>
        </span>
      </div>
      {stock.batches.length === 0 ? (
        <p className="muted">
          <span>No stock.</span>{' '}
          {drug.active && (
            <button className="btn btn-ghost btn-sm" onClick={onReceive}>
              + Receive stock
            </button>
          )}
        </p>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Lot</th>
                <th>Expiry date</th>
                <th className="r num">Remaining</th>
                <th>Received on</th>
                <th className="r num">Purchase price</th>
                <th className="r num">Value</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stock.batches.map((b, i) => (
                <tr key={b.id} className={b.days < 0 ? 'inv-expired' : ''}>
                  <td className="num">
                    {b.lot}
                    {i === stock.batches.findIndex((x) => x.days >= 0) && <span className="badge b-info inv-fefo">FEFO next</span>}
                  </td>
                  <td>
                    <ExpiryCell batch={b} />
                  </td>
                  <td className="r num">{b.qty}</td>
                  <td className="num">{fmtDate(b.receivedAt)}</td>
                  <td className="r num">{fmtMoney(b.cost)}</td>
                  <td className="r num">{fmtMoney(b.qty * b.cost)}</td>
                  <td className="acts-td">
                    {b.days < 0 ? <span className="badge b-danger">Expired</span> : <span className="badge b-success">Usable</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
