import Icon from './Icon'
import { translate } from '../i18n'
import { vitalDef, groupProposals, applicable } from '../api/vitals'

// Sinh hiệu server đọc được trong lời kể (ERD v2.0, vital_proposals) — chỉ là ĐỀ XUẤT: y tá bấm xác nhận thì mới điền vào ô.
// Không bao giờ ghi đè số đã nhập: ô đã có giá trị thì đề xuất chỉ hiện để đối chiếu. Huyết áp đi theo cặp (group).
//  - list: [{ key, value, evidence, group }]; form: giá trị đang nhập (chuỗi) theo khoá sinh hiệu.
//  - onApply({ khoá: chuỗi }): điền các ô còn trống; onDrop(keys): bỏ đề xuất.
const text = (item) =>
  item.bp
    ? `${translate('Blood pressure')} ${item.values.systolic_bp_mmhg ?? '?'}/${item.values.diastolic_bp_mmhg ?? '?'} mmHg`
    : `${translate(vitalDef(item.keys[0])?.label ?? item.keys[0])} ${item.values[item.keys[0]]} ${translate(vitalDef(item.keys[0])?.unit ?? '')}`

export default function VitalProposals({ list, form, onApply, onDrop, disabled = false }) {
  if (!list?.length) return null
  const items = groupProposals(list)
  const open = items.filter((i) => Object.keys(applicable(i, form)).length)
  function applyAll() {
    onApply(Object.assign({}, ...open.map((i) => applicable(i, form))))
    onDrop(items.flatMap((i) => i.keys))
  }
  return (
    <div className="sym-proposals vital-proposals">
      <div className="sym-proposals-head">
        <b>{translate('Vital signs from the description — confirm before use')}</b>
        {open.length > 0 && (
          <button type="button" className="btn btn-primary btn-sm" disabled={disabled} onClick={applyAll}>
            <Icon name="check" /> {translate('Fill empty fields')}
          </button>
        )}
      </div>
      <div className="sym-chips">
        {items.map((i) => {
          const fill = applicable(i, form)
          const kept = !Object.keys(fill).length
          return (
            <span key={i.id} className={'sym-chip pending' + (kept ? ' kept' : '')} title={i.evidence ? '“' + i.evidence + '”' : ''}>
              <span>
                {text(i)}
                {i.evidence && <small className="vp-ev"> · “{i.evidence}”</small>}
                {kept && <small className="vp-ev"> · {translate('already entered — kept')}</small>}
              </span>
              {!kept && (
                <button
                  type="button"
                  className="sym-chip-ok"
                  disabled={disabled}
                  onClick={() => {
                    onApply(fill)
                    onDrop(i.keys)
                  }}
                  title={translate('Confirm')}
                >
                  <Icon name="check" />
                </button>
              )}
              <button type="button" className="sym-chip-x" disabled={disabled} onClick={() => onDrop(i.keys)} title={translate('Discard')}>
                <Icon name="x" />
              </button>
            </span>
          )
        })}
      </div>
    </div>
  )
}
