import { useState } from 'react'
import Icon from '../../components/Icon'
import DutyBoard from '../../components/DutyBoard'
import { translate } from '../../i18n'
import { useDoctorShifts } from '../../api/doctorShiftStore'
import PeriodPicker from '../reception/PeriodPicker'
import { periodRange, inRange, ymd, dmy, hhmm } from '../reception/shared'
import { exportCsv, Pager, paginate } from './inventory/shared'

const COLS = [
  ['visits', 'Visits'],
  ['rx', 'Prescriptions'],
  ['labs', 'Lab orders'],
  ['referred', 'Referrals']
]
const mins = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000))
const dur = (m) => Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0')

// Quản trị › Ca khám bác sĩ: ai đang trực ở phòng nào + lịch sử kết thúc ca (tổng kết từng ca) — theo dõi khối lượng
// công việc và chất lượng kê đơn (số lần kê dù có cảnh báo nặng). Dữ liệu từ doctorShiftStore / dutyStore.
export default function DoctorShiftsPage() {
  const shifts = useDoctorShifts()
  const [period, setPeriod] = useState('week')
  const [date, setDate] = useState('')
  const [doctor, setDoctor] = useState('')
  const [page, setPage] = useState(1)

  const range = periodRange(period, date)
  const doctors = [...new Set(shifts.map((s) => s.doctor))].sort()
  const list = shifts.filter((s) => inRange(ymd(new Date(s.end)), range) && (!doctor || s.doctor === doctor))
  const total = Object.fromEntries(COLS.map(([k]) => [k, list.reduce((n, s) => n + (s.summary[k] ?? 0), 0)]))
  const pg = paginate(list, page, 15)

  function csv() {
    exportCsv(
      'doctor-shifts.csv',
      ['Date', 'Doctor', 'Room', 'Start', 'End', ...COLS.map(([, l]) => l), 'Note'],
      list.map((s) => [dmy(s.end), s.doctor, s.room ?? '', hhmm(s.start), hhmm(s.end), ...COLS.map(([k]) => s.summary[k] ?? 0), s.note])
    )
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Doctor shifts</h1>
          <p>Who is on duty in which room, and the summary of every shift a doctor has closed</p>
        </div>
      </div>
      <DutyBoard />

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-title">
          <Icon name="clock" /> Closed shifts <span className="cnt">{list.length}</span>
        </div>
        <div className="cash-filters">
          <PeriodPicker
            period={period}
            date={date}
            onChange={(p, d) => {
              setPeriod(p)
              setDate(d)
              setPage(1)
            }}
          />
          <select
            value={doctor}
            onChange={(e) => {
              setDoctor(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" disabled={!list.length} onClick={csv}>
            <Icon name="download" /> Export CSV
          </button>
        </div>
        <div className="shift-sum" style={{ gridTemplateColumns: 'repeat(6,minmax(0,1fr))', marginBottom: 12 }}>
          {COLS.map(([k, l]) => (
            <div key={k} className={k === 'overrides' && total[k] ? 'warn' : ''}>
              <b>{total[k]}</b>
              <span>{l}</span>
            </div>
          ))}
        </div>
        <table className="dt">
          <thead>
            <tr>
              <th>Date</th>
              <th>Doctor</th>
              <th>Room</th>
              <th>Time</th>
              {COLS.map(([k, l]) => (
                <th key={k} className="num">
                  {l}
                </th>
              ))}
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {pg.rows.map((s) => (
              <tr key={s.id}>
                <td className="mono">{dmy(s.end)}</td>
                <td>{s.doctor}</td>
                <td className="mono">{s.room || '—'}</td>
                <td className="mono">
                  {hhmm(s.start)}–{hhmm(s.end)} <span className="ai-soft">({dur(mins(s.start, s.end))})</span>
                </td>
                {COLS.map(([k]) => (
                  <td key={k} className={'num mono' + (k === 'overrides' && s.summary[k] ? ' warn-text' : '')}>
                    {s.summary[k] ?? 0}
                  </td>
                ))}
                <td className="ai-soft" style={{ fontSize: 13 }}>
                  {s.note || '—'}
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={5 + COLS.length}>
                  <div className="empty-state">
                    <Icon name="clock" />
                    <b>{translate('No closed shifts in this period.')}</b>
                    <span>Doctors close a shift with “End shift” in the consultation area.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pager {...pg} onPage={setPage} />
      </div>
    </div>
  )
}
