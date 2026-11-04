import Icon from '../../../components/Icon'
import DrugPicker from '../../../components/DrugPicker'
import { translate } from '../../../i18n'
import { findDrugByName } from '../../../api/inventoryStore'
import { controlledKind, CONTROLLED_LABEL } from '../../../api/rxSafety'
import { unitLabel } from '../../admin/inventory/shared'
import { dmy } from '../../reception/shared'
import { SLOTS, MEALS, perDay, unitVi } from './rxDraft'

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
export default function RxEditor({ rx, tried, invDrugs, srvDrugs, issueOf, issues, short, last, setLine, setDose, onAdd, onTemplate, onRepeat, onRemove }) {
  return (
    <>
      <div className="card-title" style={{ marginBottom: 8 }}>
        <Icon name="clipboard" /> Prescription <span className="cnt">{rx.length}</span>
      </div>
      <DrugPicker onPick={onAdd} drugs={srvDrugs} inputId={DRUG_SEARCH_ID} title="Alt+T" />
      <div className="rx-quick">
        <span className="ai-soft">Templates:</span>
        {TEMPLATES.map((t) => (
          <button key={t.key} className="chip-btn" onClick={() => onTemplate(t.key)}>
            {t.title}
          </button>
        ))}
        {last && (
          <button className="chip-btn accent" onClick={onRepeat} title={dmy(last.rxAt)}>
            <Icon name="repeat" /> Repeat last prescription
          </button>
        )}
      </div>
      <p className="ai-soft" style={{ fontSize: 12, margin: '4px 0 0' }}>
        Reference templates — the doctor adjusts the drugs, doses and duration for each patient.
      </p>

      {rx.length > 0 ? (
        <div className="rx-lines">
          {rx.map((it) => {
            const issue = issueOf(it)
            const bad = tried && (!(parseInt(it.qty) > 0) || !it.usage.trim())
            const daily = perDay(it.dose)
            return (
              <div className={'rx-line' + (bad ? ' bad' : '')} key={it.id}>
                <div className="rx-line-top">
                  <b>{it.name}</b>
                  {controlledKind(findDrugByName(it.name, invDrugs)) && (
                    <span className="badge low" title={translate('Printed on a separate prescription')}>
                      {translate(CONTROLLED_LABEL[controlledKind(findDrugByName(it.name, invDrugs))])}
                    </span>
                  )}
                  <label className="rx-ess" title={translate('Reception warns the patient if they decide not to buy this drug')}>
                    <input type="checkbox" checked={it.essential} onChange={() => setLine(it.id, { essential: !it.essential })} /> <span>Must buy — warn reception</span>
                  </label>
                  <button className="icon-btn sm danger" title={translate('Remove')} onClick={() => onRemove(it.id)}>
                    <Icon name="x" />
                  </button>
                </div>
                <div className="rx-dose">
                  {SLOTS.map(([k, label]) => (
                    <label key={k}>
                      <small>{label}</small>
                      <input type="text" inputMode="decimal" value={it.dose?.[k] ?? ''} onChange={(e) => setDose(it, { [k]: e.target.value })} placeholder="0" />
                    </label>
                  ))}
                  <label>
                    <small>Days</small>
                    <input type="text" inputMode="numeric" value={it.dose?.days ?? ''} onChange={(e) => setDose(it, { days: e.target.value })} placeholder="7" />
                  </label>
                  <label className="meal">
                    <small>When</small>
                    <select value={it.dose?.meal ?? 'after'} onChange={(e) => setDose(it, { meal: e.target.value })}>
                      {MEALS.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {daily > 0 && (
                    <span className="rx-daily">
                      {daily} {unitVi(it.unit)}/{translate('day')}
                    </span>
                  )}
                </div>
                <div className="rx-line-fields">
                  <span className="rx-qty">
                    <input type="number" min="1" placeholder="Qty" value={it.qty} onChange={(e) => setLine(it.id, { qty: e.target.value })} />
                    <span className="ai-soft">{unitLabel(it.unit)}</span>
                  </span>
                  <input className="rx-usage" type="text" list="rx-usages" placeholder="Directions — filled in from the dose above, or type for “as needed” drugs" value={it.usage} onChange={(e) => setLine(it.id, { usage: e.target.value })} />
                </div>
                {issue && (
                  <div className={'rx-stock ' + issue.level}>
                    <Icon name="alert" /> <span>{issue.text}</span>
                    {issue.usable != null && (
                      <>
                        {' '}
                        (<span>only</span> <span className="mono">{issue.usable}</span> <span>{unitLabel(issue.unit)}</span>)
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <datalist id="rx-usages">
            {USAGES.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
      ) : (
        <div className="empty-state" style={{ padding: '22px 10px' }}>
          <Icon name="clipboard" />
          <b>No drugs yet</b>
          <span>Search the catalog, pick a template or repeat the last prescription. A visit can also be completed without drugs.</span>
        </div>
      )}

      {short?.length > 0 && (
        <div className="warn-banner danger show">
          <div className="icon">
            <Icon name="ban" />
          </div>
          <div className="txt">
            <b>{translate('Confirmation blocked — not enough usable stock')}</b>
            {short.map((x) => (
              <div key={x.key}>
                <span>{x.name}</span> — <span>{translate(SHORT_REASON[x.reason] ?? x.reason)}</span> ({translate('needs')} <b className="mono">{x.need}</b>, {translate('usable')} <b className="mono">{x.usable}</b>)
              </div>
            ))}
          </div>
        </div>
      )}
      {issues.length > 0 && (
        <div className="warn-banner danger show">
          <div className="icon">
            <Icon name="box" />
          </div>
          <div className="txt">
            <b>Stock problem</b>
            {issues.map(({ it, issue }) => (
              <div key={it.id}>
                <span>{it.name}</span> — <span>{issue.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
