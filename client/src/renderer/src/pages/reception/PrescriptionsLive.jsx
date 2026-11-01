import { Fragment, useState } from 'react'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { usePrescriptions } from '../../api/prescriptionApi'
import { canRecall, recallVisit } from '../../api/queueStore'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { printHtml, esc } from '../admin/inventory/shared'
import { fold } from '../../api/patient'
import { ticketNo } from '../../components/queuePrint'
import PeriodPicker from './PeriodPicker'
import { fmt, hhmm, dmy, ymd, periodRange, periodLabel, PAY_STATUS } from './shared'

const STATUS_FILTERS = [
  { key: '', label: 'All payment statuses' },
  { key: 'unpaid', label: 'Not paid' },
  { key: 'paid', label: 'Paid' }
]

// Đơn đã xác nhận theo kỳ từ GET /prescriptions. Bấm một dòng để xem các thuốc. onRecalled (màn bác sĩ): có nút thu hồi
// đơn còn chờ thanh toán của chính mình để sửa; thu hồi xong gọi onRecalled(visitId) để mở phòng khám.
export default function PrescriptionsLive({ initialDoctorId = '', initialDoctorName = '', onRecalled }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [asking, setAsking] = useState(null)
  const [recalling, setRecalling] = useState(false)
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState('today')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState('')
  const [doctorId, setDoctorId] = useState(initialDoctorId)
  const [open, setOpen] = useState(null)

  const [from, to] = periodRange(period, date)
  const { list: all, loaded, error } = usePrescriptions({ from: period === 'all' ? '2000-01-01' : from, to: period === 'all' ? ymd(new Date()) : to })
  const doctors = [...new Map([...(initialDoctorId ? [[initialDoctorId, initialDoctorName]] : []), ...all.map((r) => [r.doctorId, r.doctor])]).entries()].sort((a, b) =>
    a[1].localeCompare(b[1])
  )
  const needle = fold(q)
  const list = all.filter(
    (r) =>
      (!status || r.pay === status) &&
      (!doctorId || r.doctorId === doctorId) &&
      (!needle || fold([r.name, r.patientId, r.doctor, ...r.rx.map((x) => x.name)].join(' ')).includes(needle))
  )
  const count = (s) => list.filter((r) => r.pay === s).length
  const value = list.reduce((s, r) => s + r.amount, 0)
  const when = (r) => (period === 'today' ? hhmm(r.at) : dmy(r.at) + ' ' + hhmm(r.at))

  async function recall(r) {
    setRecalling(true)
    const res = await recallVisit(r, user)
    setRecalling(false)
    setAsking(null)
    if (!res.ok) return showToast(translate(res.error))
    showToast('Prescription recalled — edit it in the consultation room')
    onRecalled(r.visitId)
  }

  function printList() {
    const t = translate
    const rows = list
      .map(
        (r) =>
          `<tr><td>${esc(when(r))}</td><td>${esc(r.name)}<br><small>${esc(r.patientId)}</small></td><td>${esc(r.doctor)}</td><td>${esc(
            r.rx.map((x) => `${x.name} × ${x.qty}`).join(', ')
          )}</td><td>${esc(t(PAY_STATUS[r.pay].label))}</td><td class="num">${fmt(r.amount)}</td></tr>`
      )
      .join('')
    printHtml(
      t('Prescription list'),
      `<h1>${esc(t('Prescription list'))} — ${esc(t(periodLabel(period, date)))}</h1>
      <p class="meta">${esc(t('Prescriptions'))}: <b>${list.length}</b> · ${esc(t('Invoice total'))}: <b>${fmt(value)}</b></p>
      <table><thead><tr><th>${esc(t('Prescribed'))}</th><th>${esc(t('Patient'))}</th><th>${esc(t('Doctor'))}</th><th>${esc(t('Medicines'))}</th><th>${esc(
        t('Payment')
      )}</th><th class="num">${esc(t('Amount'))}</th></tr></thead><tbody>${rows}</tbody></table>`,
      'other'
    )
  }

  return (
    <>
      <div className="inv-stats">
        <div className="inv-stat static">
          <span className="val">{list.length}</span>
          <span className="lbl">Prescriptions</span>
        </div>
        <button className={'inv-stat paid' + (status === 'paid' ? ' active' : '')} onClick={() => setStatus(status === 'paid' ? '' : 'paid')}>
          <span className="val">{count('paid')}</span>
          <span className="lbl">Paid</span>
        </button>
        <button className={'inv-stat unpaid' + (status === 'unpaid' ? ' active' : '')} onClick={() => setStatus(status === 'unpaid' ? '' : 'unpaid')}>
          <span className="val">{count('unpaid')}</span>
          <span className="lbl">Not paid</span>
        </button>
        <div className="inv-stat static">
          <span className="val mono">{fmt(value)}</span>
          <span className="lbl">Invoice total</span>
        </div>
      </div>

      <div className="card">
        <div className="cash-filters">
          <PeriodPicker
            period={period}
            date={date}
            onChange={(p, d) => {
              setPeriod(p)
              setDate(d)
            }}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">All doctors</option>
            {doctors.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <input className="grow" type="search" placeholder="Search patient, doctor or drug…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-ghost btn-sm" disabled={!list.length} onClick={printList}>
            <Icon name="printer" /> Print list
          </button>
        </div>
        <table className="dt">
          <thead>
            <tr>
              <th>No.</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Medicines</th>
              <th>Prescribed</th>
              <th className="num">Amount</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <Fragment key={r.id}>
                <tr className="clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td className="mono">{r.ticket ? ticketNo(r.ticket) : '—'}</td>
                  <td>
                    <b>{r.name}</b>
                    <div className="ai-soft mono" style={{ fontSize: 12 }}>
                      {r.patientId}
                    </div>
                  </td>
                  <td>{r.doctor}</td>
                  <td className="ai-soft" style={{ fontSize: 13 }}>
                    {r.rx.map((x) => x.name).join(', ')}
                  </td>
                  <td className="mono">{when(r)}</td>
                  <td className="num mono">{fmt(r.amount)}</td>
                  <td>
                    <span className={'badge ' + PAY_STATUS[r.pay].cls}>{PAY_STATUS[r.pay].label}</span>
                  </td>
                </tr>
                {open === r.id && (
                  <tr>
                    <td colSpan="7">
                      <table className="dt">
                        <tbody>
                          {r.rx.map((x, i) => (
                            <tr key={i}>
                              <td>{x.name}</td>
                              <td className="num">
                                {x.qty} {x.unit}
                              </td>
                              <td>{x.usage}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {onRecalled && canRecall(r, user) && (
                        <div className="rx-recall">
                          {asking === r.id ? (
                            <>
                              <span>Recall this prescription? Stock is returned and the unpaid invoice is cancelled; you then edit and finalize it again.</span>
                              <button className="btn btn-ghost btn-sm" disabled={recalling} onClick={() => setAsking(null)}>
                                Cancel
                              </button>
                              <button className="btn btn-primary btn-sm" disabled={recalling} onClick={() => recall(r)}>
                                <Icon name="repeat" /> Recall
                              </button>
                            </>
                          ) : (
                            <button className="btn btn-ghost btn-sm" onClick={() => setAsking(r.id)} title={translate('Reception has not collected payment or dispensed any drug yet')}>
                              <Icon name="repeat" /> Recall to edit (not yet paid)
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!list.length && (
              <tr>
                <td colSpan="7">
                  <div className="empty-state">
                    <Icon name="clipboard" />
                    <b>{error ? error.message : !loaded ? translate('Loading…') : all.length ? translate('No prescriptions match the filters.') : translate('No prescriptions in this period.')}</b>
                    <span>Try another period or clear the filters.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
