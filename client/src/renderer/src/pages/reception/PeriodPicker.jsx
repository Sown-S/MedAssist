import { PERIODS, ymd } from './shared'

// Chọn kỳ xem số liệu: Hôm nay / Tuần này / Tháng này / Tất cả, hoặc một ngày cụ thể.
export default function PeriodPicker({ period, date, onChange }) {
  return (
    <div className="period-picker">
      <div className="ai-seg">
        {PERIODS.filter((p) => p.key !== 'date').map((p) => (
          <button key={p.key} className={period === p.key ? 'active' : ''} onClick={() => onChange(p.key, date)}>
            {p.label}
          </button>
        ))}
      </div>
      <input
        type="date"
        className={period === 'date' ? 'active' : ''}
        value={period === 'date' ? date : ''}
        max={ymd(new Date())}
        title="Pick a date"
        onChange={(e) => onChange(e.target.value ? 'date' : 'today', e.target.value)}
      />
    </div>
  )
}
