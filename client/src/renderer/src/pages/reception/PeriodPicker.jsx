import { PERIODS } from './shared'
import { ymd } from '../../utils/format'
import DateField from '../../components/DateField'
import { translate } from '../../i18n'

export default function PeriodPicker({ period, date, onChange }) {
  return (
    <div className="period">
      <div className="seg">
        {PERIODS.filter((p) => p.key !== 'date').map((p) => (
          <button key={p.key} className={period === p.key ? 'on' : ''} onClick={() => onChange(p.key, date)}>
            {p.label}
          </button>
        ))}
      </div>
      <DateField className={period === 'date' ? 'on' : ''} style={{ width: 160 }} value={period === 'date' ? date : ''} max={ymd(new Date())} title={translate('Pick a date')} onChange={(v) => onChange(v ? 'date' : 'today', v)} />
    </div>
  )
}
