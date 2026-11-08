import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { labOrderSummary, labRows } from '../../../api/queueStore'
import { hhmm } from '../../reception/shared'
import { printLabOrder } from '../LabOrderModal'

// Kết quả cận lâm sàng nhập từ phiếu giấy: từng dòng chỉ định + kết luận của phiếu. Chưa lưu thì giữ trong bản nháp.
export default function LabResultsEntry({ visit, labOrders, labResults, resultOf, conclusionOf, onResult, onConclusion, onCancelRow, onSave, error }) {
  return (
    <>
      {labOrders.length > 0 && (
        <>
          <div className="section-label">Lab tests ordered · results from the paper report</div>
          {labOrders.map((o) => (
            <div key={o.id} className="symptom-box lab-entry">
              <div className="lab-ordered">
                <div>
                  <b>{labOrderSummary(o)}</b>
                  <small>
                    {hhmm(o.at)} · {o.by}
                    {o.note ? ' · ' + o.note : ''}
                  </small>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => printLabOrder(visit, o)}>
                  <Icon name="printer" /> Reprint
                </button>
              </div>
              {labRows(o).map((r) =>
                r.cancelled ? (
                  <div key={r.key} className="lab-entry-row ai-dim">
                    <span>
                      <s>{r.name}</s>
                    </span>
                    <small className="ai-soft">{translate('Cancelled — not done')}</small>
                  </div>
                ) : (
                  <label key={r.key} className="lab-entry-row">
                    <span>
                      {r.name}
                      {r.ref && <small className="ai-soft"> · {r.ref}</small>}
                    </span>
                    <input
                      type="text"
                      value={resultOf(r)}
                      onChange={(e) => onResult(r.key, e.target.value)}
                      placeholder="Result, e.g. 13.2 G/L (high)"
                    />
                    {!r.result && !(labResults[r.key] ?? '').trim() && (
                      <button type="button" className="btn btn-ghost btn-sm" title={translate('The patient did not have this done')} onClick={() => onCancelRow(r)}>
                        <Icon name="x" />
                      </button>
                    )}
                  </label>
                )
              )}
              <textarea
                className="doc-ta"
                rows="2"
                style={{ marginTop: 6 }}
                value={conclusionOf(o)}
                onChange={(e) => onConclusion(o.id, e.target.value)}
                placeholder="Conclusion of this order, e.g. Raised inflammatory markers…"
              />
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onSave()}>
              <Icon name="save" /> Save lab results
            </button>
          </div>
        </>
      )}
      {error && <p className="ai-soft">{error}</p>}
    </>
  )
}
