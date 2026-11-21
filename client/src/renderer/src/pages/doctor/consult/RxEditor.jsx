import Icon from '../../../components/Icon'
import DrugPicker from '../../../components/DrugPicker'
import { translate } from '../../../i18n'
import { unitLabel } from '../../admin/inventory/shared'
import { SLOTS, MEALS, perDay, unitVi, wholeQty } from './rxDraft'
import { dmy } from '../../../utils/format'

// Đơn mẫu: một lần bấm thêm cả nhóm thuốc.
const TEMPLATES = [
  { key: 'throat', title: 'Pharyngitis / tonsillitis' },
  { key: 'gastric', title: 'Gastric pain' },
  { key: 'diabetes', title: 'Type 2 diabetes' },
  { key: 'rash', title: 'Allergic rash' },
  { key: 'pain', title: 'Pain relief' }
]
// Cách dùng gợi ý cho thuốc dùng khi cần — viết tiếng Việt vì đơn in cho bệnh nhân.
const USAGES = ['Uống khi sốt trên 38,5°C, cách nhau ít nhất 4–6 giờ', 'Uống khi đau, sau ăn, tối đa 3 lần/ngày', 'Uống trước ăn sáng 30 phút', 'Bôi ngày 2 lần lên vùng da tổn thương']

// Lý do bị chặn khi trừ kho lúc chốt đơn (INSUFFICIENT_STOCK).
const SHORT_REASON = {
  out: 'Out of stock',
  expiring: 'In stock, but the batches expire before the course ends',
  inactive: 'Discontinued in the drug catalog'
}

export const DRUG_SEARCH_ID = 'consult-drug-search'

// Phần kê đơn: tìm thuốc, đơn mẫu, lặp đơn gần nhất, từng dòng thuốc (liều theo buổi → số lượng + cách dùng),
// cảnh báo tồn kho và chặn chốt khi thiếu thuốc.
export default function RxEditor({ rx, tried, srvDrugs, issueOf, issues, short, last, setLine, setDose, onAdd, onTemplate, onRepeat, onRemove }) {
  return (
    <>
      <div className="card-h">
        <h3>
          {translate('Prescription')} {rx.length > 0 && <span className="plain">· {rx.length}</span>}
        </h3>
        <div className="tpl" title={translate('Reference templates — the doctor adjusts the drugs, doses and duration for each patient.')}>
          {translate('Templates:')}
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" onClick={() => onTemplate(t.key)}>
              {translate(t.title)}
            </button>
          ))}
          {last && (
            <button type="button" onClick={onRepeat} title={dmy(last.rxAt)}>
              <Icon name="repeat" /> {translate('Repeat last prescription')}
            </button>
          )}
        </div>
      </div>
      <div className="card-b">
        <div className="mb-12">
          <DrugPicker onPick={onAdd} drugs={srvDrugs} inputId={DRUG_SEARCH_ID} title="Alt+T" />
        </div>

        {rx.length > 0 ? (
          <div className="tbl-wrap" style={{ maxHeight: 'none' }}>
            <table className="rx-tbl">
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>Dose per time</th>
                  <th>When</th>
                  <th className="w-80">Days</th>
                  <th className="w-90">Qty</th>
                  <th>Directions</th>
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {rx.map((it) => {
                  const issue = issueOf(it)
                  const bad = tried && (!wholeQty(it.qty) || !it.usage.trim())
                  const daily = perDay(it.dose)
                  return (
                    <tr key={it.id} className={bad ? 'pr-danger' : ''}>
                      <td className="minw-170">
                        <b className="fw-500">{it.name}</b>
                        {issue ? (
                          <div className="small text-danger">
                            {issue.text}
                            {issue.usable != null && (
                              <>
                                {' '}
                                (<span>only</span> <span className="num">{issue.usable}</span> <span>{unitLabel(issue.unit)}</span>)
                              </>
                            )}
                          </div>
                        ) : (
                          daily > 0 && (
                            <div className="muted small">
                              {daily} {unitVi(it.unit)}/{translate('day')}
                            </div>
                          )
                        )}
                        <label className="check mt-4 fs-13" title={translate('Reception warns the patient if they decide not to buy this drug')}>
                          <input type="checkbox" checked={it.essential} onChange={() => setLine(it.id, { essential: !it.essential })} />
                          {translate('Must buy — warn reception')}
                        </label>
                      </td>
                      <td>
                        <div className="d-flex gap-4">
                          {SLOTS.map(([k, label]) => (
                            <input
                              key={k}
                              className="input num w-46 text-center"
                              type="text"
                              inputMode="decimal"
                              title={translate(label)}
                              aria-label={translate(label)}
                              value={it.dose?.[k] ?? ''}
                              onChange={(e) => setDose(it, { [k]: e.target.value })}
                              placeholder={translate(label).slice(0, 1)}
                            />
                          ))}
                        </div>
                      </td>
                      <td>
                        <select className="input" value={it.dose?.meal ?? 'after'} onChange={(e) => setDose(it, { meal: e.target.value })} aria-label={translate('When')}>
                          {MEALS.map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input className="input num" type="text" inputMode="numeric" value={it.dose?.days ?? ''} onChange={(e) => setDose(it, { days: e.target.value })} placeholder="7" aria-label={translate('Days')} />
                      </td>
                      <td>
                        <input className="input num" type="number" min="1" step="1" placeholder={translate('Qty')} title={unitLabel(it.unit)} value={it.qty} onChange={(e) => setLine(it.id, { qty: e.target.value })} aria-label={translate('Qty')} />
                      </td>
                      <td className="minw-220">
                        <input className="input" type="text" list="rx-usages" placeholder="Directions — filled in from the dose above, or type for “as needed” drugs" value={it.usage} onChange={(e) => setLine(it.id, { usage: e.target.value })} />
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-icon" title={translate('Remove')} aria-label={translate('Remove')} onClick={() => onRemove(it.id)}>
                          <Icon name="trash-2" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <datalist id="rx-usages">
              {USAGES.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        ) : (
          <div className="empty" style={{ padding: '22px 10px' }}>
            <div className="ill">
              <Icon name="pill" />
            </div>
            <b>No drugs yet</b>
            <span>Search the catalog, pick a template or repeat the last prescription. A visit can also be completed without drugs.</span>
          </div>
        )}

        {short?.length > 0 && (
          <div className="stock-issue">
            <Icon name="ban" />
            <span>
              <b>{translate('Confirmation blocked — not enough usable stock')}:</b>{' '}
              {short.map((x, i) => (
                <span key={x.key}>
                  {i > 0 && '; '}
                  {x.name} — {translate(SHORT_REASON[x.reason] ?? x.reason)} ({translate('needs')} <b className="num">{x.need}</b>, {translate('usable')} <b className="num">{x.usable}</b>)
                </span>
              ))}
            </span>
          </div>
        )}
        {issues.length > 0 && (
          <div className="stock-issue">
            <Icon name="package-x" />
            <span>
              <b>{translate('Stock problem')}:</b>{' '}
              {issues.map(({ it, issue }, i) => (
                <span key={it.id}>
                  {i > 0 && '; '}
                  {it.name} — {issue.text}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </>
  )
}
