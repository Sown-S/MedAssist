import Icon from './Icon'
import { translate } from '../i18n'
import { vitalDef, groupProposals, applicable } from '../api/vitals'

// Sinh hiệu server đọc được trong lời kể chỉ là đề xuất: y tá xác nhận mới điền. Không bao giờ ghi đè số đã nhập;
// huyết áp đi theo cặp. Lời kể đã sửa sau lần trích xuất (stale) → khoá xác nhận cho tới khi trích xuất lại.
const text = (item) =>
  item.bp
    ? `${translate('Blood pressure')} ${item.values.systolic_bp_mmhg ?? '?'}/${item.values.diastolic_bp_mmhg ?? '?'} mmHg`
    : `${translate(vitalDef(item.keys[0])?.label ?? item.keys[0])} ${item.values[item.keys[0]]} ${translate(vitalDef(item.keys[0])?.unit ?? '')}`

export default function VitalProposals({ list, form, onApply, onDrop, disabled = false, stale = false }) {
  if (!list?.length) return null
  const items = groupProposals(list)
  const open = items.filter((i) => Object.keys(applicable(i, form)).length)
  function apply(fill, keys) {
    if (stale) return
    onApply(fill)
    onDrop(keys)
  }
  function applyAll() {
    if (stale) return
    onApply(Object.assign({}, ...open.map((i) => applicable(i, form))))
    onDrop(items.flatMap((i) => i.keys))
  }
  return (
    <div className="proposals vital-proposals">
      <div className="h">
        <Icon name="activity" />
        {translate('Vital signs from the description — confirm before use')}
      </div>
      {stale && (
        <div className="hint-w" style={{ margin: '0 0 8px' }}>
          <Icon name="triangle-alert" /> {translate('The description changed — run the suggestion again before using these.')}
        </div>
      )}
      {items.map((i) => {
        const fill = applicable(i, form)
        const kept = !Object.keys(fill).length
        return (
          <span key={i.id} className={'pchip' + (kept ? ' kept' : '')} title={i.evidence ? '“' + i.evidence + '”' : ''}>
            {text(i)}
            {kept && <span className="muted small">· {translate('already entered — kept')}</span>}
            {!kept && (
              <button type="button" className="ok" disabled={disabled || stale} onClick={() => apply(fill, i.keys)} title={translate('Confirm')} aria-label={translate('Confirm')}>
                <Icon name="check" />
              </button>
            )}
            <button type="button" disabled={disabled} onClick={() => onDrop(i.keys)} title={translate('Discard')} aria-label={translate('Discard')}>
              <Icon name="x" />
            </button>
          </span>
        )
      })}
      {open.length > 0 && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled || stale} onClick={applyAll}>
          {translate('Fill empty fields')}
        </button>
      )}
    </div>
  )
}
