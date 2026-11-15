import { PERIODS } from './shared'
import { ymd } from '../../utils/format'

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
      <input
        type="date"
        className={'input' + (period === 'date' ? ' on' : '')}
        style={{ width: 160, height: 40 }}
        value={period === 'date' ? date : ''}
        max={ymd(new Date())}
        title="Pick a date"
        onChange={(e) => onChange(e.target.value ? 'date' : 'today', e.target.value)}
      />
    </div>
  )
}
