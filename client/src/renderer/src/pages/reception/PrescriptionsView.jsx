import { useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import PatientAlerts from '../../components/PatientAlerts'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { useQueue, payStatusOf, ST } from '../../api/queueStore'
import { useInvoices, invoiceById } from '../../api/invoiceStore'
import { useRxHistory } from '../../api/rxHistory'
import { useRxReviews, reviewsOf, verdictOf } from '../../api/rxReviewStore'
import { buildItems, lineAmount, estimateTotal, outsideLines } from '../../api/billing'
import { printHtml, esc } from '../admin/inventory/shared'
import { getInventory } from '../../api/inventoryStore'
import { printPrescription } from '../doctor/printRx'
import PeriodPicker from './PeriodPicker'
import { fold } from '../../api/patientStore'
import { ticketNo } from '../../components/queuePrint'
import { fmt, hhmm, dmy, ymd, periodRange, inRange, periodLabel, PAY_STATUS } from './shared'
import { normalizeVitals } from '../../api/vitals'

// Trạng thái thanh toán của một đơn: lượt khám hôm nay theo hàng chờ, đơn ngày cũ theo hoá đơn đã lập.
function payOf(r) {
  if (r.live) return payStatusOf(r.v) ?? 'unpaid'
  const inv = r.v.invoiceId && invoiceById(r.v.invoiceId)
  return inv && inv.status !== 'cancelled' ? inv.status : 'unpaid'
}

const STATUS_FILTERS = [
  { key: '', label: 'All payment statuses' },
  { key: 'unpaid', label: 'Not paid' },
  { key: 'processing', label: 'Waiting for transfer' },
  { key: 'paid', label: 'Paid' }
]

// Đơn thuốc bác sĩ kê — lễ tân CHỈ XEM để đối chiếu khi lập hoá đơn, không sửa.
// Hôm nay lấy từ hàng chờ; các ngày trước lấy từ lịch sử đơn thuốc (rxHistory) → lọc được theo ngày / tuần / tháng.
// showReviews: màn của bác sĩ — hiện kết quả đánh giá lại gần nhất của từng đơn.
export default function PrescriptionsView({ readOnly, onPay, onRx, initialDoctor = '', showReviews = false }) {
  const { visits } = useQueue()
  const history = useRxHistory()
  const reviews = useRxReviews()
  useInvoices()
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState('today')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState('')
  const [doctor, setDoctor] = useState(initialDoctor)

  const today = ymd(new Date())
  const range = periodRange(period, date)
  const all = [
    ...visits.filter((v) => v.rx.length).map((v) => ({ v, day: today, at: v.rxAt ?? v.statusAt, live: true })),
    ...history.map((v) => ({ v, day: v.day, at: v.rxAt, live: false }))
  ].map((r) => ({ ...r, pay: payOf(r), amount: estimateTotal(r.v) }))
  const doctors = [...new Set([...all.map((r) => r.v.doctor), initialDoctor].filter(Boolean))].sort()

  const inPeriod = all.filter((r) => inRange(r.day, range))
  const needle = fold(q)
  const list = inPeriod
    .filter(
      (r) =>
        (!status || r.pay === status) &&
        (!doctor || r.v.doctor === doctor) &&
        (!needle || fold([r.v.name, r.v.phone, r.v.patientId, r.v.doctor, ...r.v.rx.map((x) => x.name)].join(' ')).includes(needle))
    )
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))

  const count = (s) => list.filter((r) => r.pay === s).length
  const value = list.reduce((s, r) => s + r.amount, 0)
  const when = (r) => (!r.at ? '—' : r.day === today ? hhmm(r.at) : dmy(r.at) + ' ' + hhmm(r.at))

  function printList() {
    const t = translate
    const rows = list
      .map(
        (r) =>
          `<tr><td>${esc(when(r))}</td><td>${esc(r.v.name)}<br><small>${esc(r.v.patientId ?? '')}</small></td><td>${esc(r.v.doctor || '—')}</td><td>${esc(
            r.v.rx.map((x) => `${x.name} × ${x.qty}`).join(', ')
          )}</td><td>${esc(t(PAY_STATUS[r.pay].label))}</td><td class="num">${fmt(r.amount)}</td></tr>`
      )
      .join('')
    printHtml(
      t('Prescription list'),
      `<h1>${esc(t('Prescription list'))} — ${esc(t(periodLabel(period, date)))}</h1>
      <p class="meta">${esc(t('Prescriptions'))}: <b>${list.length}</b> · ${esc(t('Estimated value'))}: <b>${fmt(value)}</b>${doctor ? ' · ' + esc(doctor) : ''}</p>
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
          <span className="lbl">Estimated value</span>
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
          <select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <input className="grow" type="search" placeholder="Search patient, phone, doctor or drug…" value={q} onChange={(e) => setQ(e.target.value)} />
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
              <th className="num">Estimated</th>
              <th>Payment</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const v = r.v
              return (
                <tr key={v.id} className="clickable" onClick={() => onRx(v)}>
                  <td className="mono">{v.ticket ? ticketNo(v.ticket) : '—'}</td>
                  <td>
                    <b>{v.name}</b>
                    {v.allergies && <span className="allergy-chip" style={{ marginLeft: 6 }}>Allergy</span>}
                    {showReviews && reviewsOf(v.id, reviews)[0] && (
                      <span className={'badge ' + verdictOf(reviewsOf(v.id, reviews)[0].verdict).tone} style={{ marginLeft: 6 }}>
                        {translate(verdictOf(reviewsOf(v.id, reviews)[0].verdict).label)}
                      </span>
                    )}
                    <div className="ai-soft mono" style={{ fontSize: 12 }}>
                      {v.patientId}
                    </div>
                  </td>
                  <td>{v.doctor || '—'}</td>
                  <td className="ai-soft" style={{ fontSize: 13 }}>
                    {v.rx.map((x) => x.name).join(', ')}
                  </td>
                  <td className="mono">{when(r)}</td>
                  <td className="num mono">{fmt(r.amount)}</td>
                  <td>
                    <span className={'badge ' + PAY_STATUS[r.pay].cls}>{PAY_STATUS[r.pay].label}</span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button className="icon-btn sm" title={translate('View prescription')} onClick={() => onRx(v)}>
                        <Icon name="eye" />
                      </button>
                      {onPay && r.live && v.status === ST.PRESCRIBED && (
                        <button className="btn btn-primary btn-sm" disabled={readOnly} onClick={() => onPay(v)}>
                          Dispense &amp; collect
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!list.length && (
              <tr>
                <td colSpan="8">
                  <div className="empty-state">
                    <Icon name="clipboard" />
                    <b>{inPeriod.length ? translate('No prescriptions match the filters.') : translate('No prescriptions in this period.')}</b>
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

// Chi tiết đơn thuốc (chỉ xem): thông tin bệnh nhân, cảnh báo dị ứng / bệnh nền, từng thuốc + cách dùng, tạm tính.
// children: phần riêng của từng vai trò hiện dưới bảng thuốc (VD bác sĩ đánh giá lại đơn — RxReviewPanel).
export function RxDetail({ visit, readOnly, onClose, onPay, children }) {
  const items = buildItems(visit)
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Prescription details') + ' — ' + visit.name} onClose={onClose} />
      <div className="pl-summary">
        {visit.ticket && (
          <span>
            {translate('no.')} <b>{ticketNo(visit.ticket)}</b>
          </span>
        )}
        <span className="mono">{visit.patientId}</span>
        <span>
          {translate(visit.gender)}
          {visit.age !== '' && visit.age != null ? ', ' + visit.age + ' ' + translate('yrs') : ''}
        </span>
        <span>
          {translate('Doctor')}: {visit.doctor || '—'}
        </span>
        {visit.rxAt && <span>{(visit.day ? dmy(visit.rxAt) + ' ' : '') + hhmm(visit.rxAt)}</span>}
      </div>
      <PatientAlerts p={visit} />
      {visit.diagnosis && (
        <p className="rx-diag">
          <b>{translate('Diagnosis')}:</b> {visit.diagnosis}
        </p>
      )}
      {visit.diagnosesExtra?.length > 0 && (
        <p className="rx-diag">
          <b>{translate('Secondary diagnoses')}:</b> {visit.diagnosesExtra.join('; ')}
        </p>
      )}
      {visit.followUp && (
        <p className="rx-diag">
          <b>{translate('Follow-up visit')}:</b> {dmy(visit.followUp + 'T12:00:00')}
        </p>
      )}
      {!children && <p className="ai-soft" style={{ fontSize: 12.5 }}>View only — changes can only be made by the doctor.</p>}
      {outsideLines(visit).length > 0 && (
        <div className="warn-banner show caution" style={{ margin: '8px 0' }}>
          <div className="icon">
            <Icon name="alert" />
          </div>
          <div className="txt">
            <b>Bought at an outside pharmacy — not on this invoice</b>
            {outsideLines(visit).map((l) => l.name + ' × ' + l.qty).join(', ')} — <span>controlled drug (N/H) on its own prescription; this pharmacy does not sell it.</span>
          </div>
        </div>
      )}
      <table className="dt">
        <thead>
          <tr>
            <th>Drug</th>
            <th className="num">Quantity</th>
            <th>Instructions</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items
            .filter((it) => it.cat === 'drug')
            .map((it) => {
              const line = visit.rx.find((r) => r.name === it.name)
              return (
                <tr key={it.id}>
                  <td>
                    {it.name}
                    {it.essential && <span className="essential-chip">Essential</span>}
                  </td>
                  <td className="num">
                    {it.qty} {translate(line?.unit ?? '')}
                  </td>
                  <td>{translate(it.sub)}</td>
                  <td className="num mono">{fmt(lineAmount(it))}</td>
                </tr>
              )
            })}
          <tr>
            <td colSpan="3">{translate('Consultation fee')}</td>
            <td className="num mono">{fmt(items[0].amt)}</td>
          </tr>
        </tbody>
      </table>
      <div className="sum-total">
        <span>Estimated total</span>
        <span className="amt">{fmt(items.reduce((s, it) => s + lineAmount(it), 0))}</span>
      </div>
      {children}
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
        {visit.rx?.length > 0 && (
          <button className="btn btn-ghost" onClick={() => printPrescription({ ...visit, weight: normalizeVitals(visit.vitals).weight_kg }, getInventory().drugs, visit.doctor)}>
            <Icon name="printer" /> Reprint prescription
          </button>
        )}
        {onPay && visit.status === ST.PRESCRIBED && (
          <button className="btn btn-primary" disabled={readOnly} onClick={() => onPay(visit)}>
            Dispense &amp; collect
          </button>
        )}
      </div>
    </Modal>
  )
}
