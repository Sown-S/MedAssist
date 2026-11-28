import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { labOrderSummary, labRows } from '../../../api/queueStore'
import { printLabOrder } from '../LabOrderModal'
import { ErrorNote } from '../../../components/DataState'
import { hhmm } from '../../../utils/format'

// Kết quả cận lâm sàng nhập từ phiếu giấy: từng dòng chỉ định + kết luận của phiếu. Chưa lưu thì giữ trong bản nháp.
export default function LabResultsEntry({ visit, labOrders, labResults, resultOf, conclusionOf, onResult, onConclusion, onCancelRow, onSave, error }) {
  if (!labOrders.length) return null
  return (
    <div className="card">
      <div className="card-h">
        <h3>
          <Icon name="flask-conical" />
          {translate('Lab tests ordered · results from the paper report')}
        </h3>
      </div>
      <div className="card-b">
        {labOrders.map((o) => (
          <div className="mb-14" key={o.id}>
            <div className="toolbar mb-8">
              <div className="grow minw-0">
                <b className="fw-600">{labOrderSummary(o)}</b>
                <div className="muted small">
                  {hhmm(o.at)} · {o.by}
                  {o.note ? ' · ' + o.note : ''}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => printLabOrder(visit, o)}>
                <Icon name="printer" />
                {translate('Reprint')}
              </button>
            </div>
            <div className="tbl-wrap" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Result</th>
                    <th className="r" />
                  </tr>
                </thead>
                <tbody>
                  {labRows(o).map((r) =>
                    r.cancelled ? (
                      <tr key={r.key} className="dim">
                        <td>
                          <s>{r.name}</s>
                        </td>
                        <td className="muted small">{translate('Cancelled — not done')}</td>
                        <td />
                      </tr>
                    ) : (
                      <tr key={r.key}>
                        <td>
                          {r.name}
                          {r.ref && <span className="muted small"> · {r.ref}</span>}
                        </td>
                        <td>
                          <input className="input h-36" type="text" value={resultOf(r)} onChange={(e) => onResult(r.key, e.target.value)} placeholder="Result, e.g. 13.2 G/L (high)" aria-label={r.name} />
                        </td>
                        <td>
                          <div className="acts">
                            {!r.result && !(labResults[r.key] ?? '').trim() && (
                              <button type="button" className="btn btn-ghost btn-icon" title={translate('The patient did not have this done')} aria-label={translate('The patient did not have this done')} onClick={() => onCancelRow(r)}>
                                <Icon name="x" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
            <div className="field mt-10">
              <input className="input" value={conclusionOf(o)} onChange={(e) => onConclusion(o.id, e.target.value)} placeholder="Conclusion of this order, e.g. Raised inflammatory markers…" />
            </div>
          </div>
        ))}
        <div className="d-flex justify-end">
          <button className="btn btn-outline btn-sm" onClick={() => onSave()}>
            <Icon name="save" />
            {translate('Save lab results')}
          </button>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </div>
  )
}
