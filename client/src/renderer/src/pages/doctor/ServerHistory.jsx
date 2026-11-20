import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { translate } from '../../i18n'
import { getHistory, getVisitRecord, VISIT_STATUS_LABEL, PRIORITY_LABEL } from '../../api/emrApi'
import { vitalsText } from '../../api/vitals'
import { toLabOrder } from '../../api/serviceStore'
import { LabOrderResults } from './doctorShared'
import DocumentModal from './DocumentModal'
import { useAuth } from '../../context/AuthContext'
import { ageFrom } from '../../api/clinicApi'
import { money, shortDateTime } from '../../utils/format'
import Skeleton from '../../components/Skeleton'
import { ErrorNote } from '../../components/DataState'

// Lịch sử khám từ server (FR04); bấm một lượt để xem đầy đủ. excludeVisitId = lượt đang khám;
// onLoaded(history) để trang cha lấy thông tin bệnh nhân.
const PAGE = 10

export default function ServerHistory({ patientId, excludeVisitId, onLoaded }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [withCancelled, setWithCancelled] = useState(false)
  const [open, setOpen] = useState(null)

  async function load(offset, append) {
    setLoading(true)
    try {
      const h = await getHistory(patientId, { limit: PAGE, offset, includeCancelled: withCancelled })
      setItems((x) => (append ? [...x, ...h.items] : h.items))
      setTotal(h.total)
      setErr('')
      if (!append) onLoaded?.(h)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    setOpen(null)
    load(0, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, withCancelled])

  const list = items.filter((v) => v.visit_id !== excludeVisitId)
  const shown = Math.max(0, total - (items.some((v) => v.visit_id === excludeVisitId) ? 1 : 0))
  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 'var(--fs-md)' }}>
          {translate('Visits')} <span className="plain">· {shown}</span>
        </h3>
        <div className="sp" />
        <label className="check">
          <input type="checkbox" checked={withCancelled} onChange={(e) => setWithCancelled(e.target.checked)} />
          {translate('Show cancelled visits')}
        </label>
      </div>
      <ErrorNote>{err}</ErrorNote>
      {!list.length && !loading && !err && <p className="muted small">{translate('No earlier visits in the system.')}</p>}
      {list.map((v) => {
        const isOpen = open === v.visit_id
        const title = v.diagnoses.length ? (v.diagnoses.find((d) => d.is_primary)?.diagnosis_name ?? v.diagnoses[0].diagnosis_name) : translate(VISIT_STATUS_LABEL[v.status] ?? v.status)
        return (
          <div key={v.visit_id} className={'visit' + (isOpen ? ' open' : '')}>
            <div
              className="visit-h"
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : v.visit_id)}
              onKeyDown={(e) => e.key === 'Enter' && setOpen(isOpen ? null : v.visit_id)}
            >
              <div className="ico n">
                <Icon name="calendar" />
              </div>
              <div className="t">
                <b>
                  {shortDateTime(v.visit_date)} · {title}
                </b>
                <span>
                  {v.physician_name ?? ''}
                  {v.physician_name ? ' · ' : ''}
                  {translate(VISIT_STATUS_LABEL[v.status] ?? v.status)}
                  {!isOpen && v.prescription ? ' · ' + v.prescription.items.map((x) => `${x.drug_label} × ${x.quantity}`).join(', ') : ''}
                </span>
              </div>
              {v.outcome === 'Referred' && (
                <span className="badge b-danger">
                  {translate('Referred')}
                  {v.referral_facility ? ' → ' + v.referral_facility : ''}
                </span>
              )}
              {v.is_red_flag && <span className="badge b-danger">{translate('Red flag')}</span>}
              {v.triage_priority && v.triage_priority !== 'Routine' && !v.is_red_flag && <span className="badge b-warning">{translate(PRIORITY_LABEL[v.triage_priority] ?? v.triage_priority)}</span>}
              <Icon name="chevron-down" className="chev" />
            </div>
            <div className="visit-b">{isOpen && <VisitDetail visitId={v.visit_id} />}</div>
          </div>
        )
      })}
      {loading && <Skeleton rows={3} compact />}
      {!loading && items.length < total && (
        <button className="btn btn-ghost btn-sm" onClick={() => load(items.length, true)}>
          {translate('Show older visits')}
        </button>
      )}
    </div>
  )
}

// Lượt kết thúc bằng chuyển tuyến: tóm tắt giấy, in lại; bác sĩ bổ sung giấy.
const TRANSPORT_LABEL = { Ambulance: 'Ambulance', Family: 'Family vehicle', Self: 'On their own', Other: 'Other' }
function ReferralBox({ record, onSaved }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const v = record.visit
  const f = v.referral
  const p = record.patient ?? {}
  const doctor = user?.roleKey === 'doctor'
  const subject = {
    name: p.full_name ?? '',
    gender: p.gender,
    age: p.date_of_birth ? ageFrom(p.date_of_birth) : '',
    patientId: p.patient_code,
    allergies: p.allergy_notes,
    referral: f
  }
  return (
    <div className="emr-referral">
      <div className="emr-referral-head">
        <span className="badge b-danger">
          <Icon name="ban" /> {translate('Referred')}
        </span>
        <b>{f.facility_name}</b>
        <span className="small muted">
          {f.reason}
          {f.transport ? ' · ' + translate(TRANSPORT_LABEL[f.transport] ?? f.transport) : ''}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          <Icon name="printer" /> {translate(doctor ? 'Amend / reprint' : 'Reprint')}
        </button>
      </div>
      {f.diagnosis && (
        <div className="small">
          <span>Diagnosis</span>: {f.diagnosis}
        </div>
      )}
      {f.signs && (
        <div className="small">
          <span>Warning signs</span>: {f.signs}
        </div>
      )}
      <div className="small muted">
        {translate(f.referred_by_role === 'Nurse' ? 'Recorded by' : 'Doctor')} {f.referred_by_name} · {shortDateTime(f.referred_at)}
        {f.amended_by_name ? ' · ' + translate('amended by') + ' ' + f.amended_by_name + ' ' + shortDateTime(f.amended_at) : ''}
      </div>
      {open && <DocumentModal subject={subject} mode={doctor ? 'amend' : 'reprint'} target={{ visitId: v.visit_id }} onDone={onSaved} onClose={() => setOpen(false)} />}
    </div>
  )
}

function VisitDetail({ visitId }) {
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    getVisitRecord(visitId).then(setR, (e) => setErr(e.message))
  }, [visitId])
  if (err)
    return (
      <div className="hint-w" style={{ gridColumn: '1 / -1' }}>
        {err}
      </div>
    )
  if (!r)
    return (
      <p className="muted small" style={{ gridColumn: '1 / -1' }}>
        {translate('Loading…')}
      </p>
    )
  const v = r.visit
  const vit = v.vital_signs ? vitalsText(v.vital_signs) : ''
  const payLabel = (st) => (st === 'Paid' ? 'Paid' : st === 'Cancelled' ? 'Cancelled' : 'Awaiting payment')
  return (
    <>
      <span className="k">{translate('Reason for visit')}</span>
      <span>
        {v.chief_complaint}
        {v.free_text_description && v.free_text_description !== v.chief_complaint && <span className="muted"> — {v.free_text_description}</span>}
      </span>
      <span className="k">{translate('Vital signs')}</span>
      <span>{vit || '—'}</span>
      {v.is_red_flag && v.red_flag_reason && (
        <>
          <span className="k">{translate('Red flag')}</span>
          <span style={{ color: 'var(--danger)' }}>{v.red_flag_reason}</span>
        </>
      )}
      <span className="k">{translate('Diagnoses')}</span>
      <span>
        {r.diagnoses.length
          ? r.diagnoses.map((d) => (
              <div key={d.diagnosis_id} style={d.confirmed_by_physician ? undefined : { textDecoration: 'line-through', color: 'var(--ink-3)' }}>
                {d.icd10_code && <b className="num">{d.icd10_code}</b>} {d.diagnosis_name}
                {!d.is_primary && <span className="muted"> · {translate('Secondary')}</span>}
                {!d.confirmed_by_physician && <span className="muted"> ({translate('withdrawn')})</span>}
                {d.clinical_notes && <div className="muted">{d.clinical_notes}</div>}
              </div>
            ))
          : translate('No diagnosis recorded.')}
      </span>
      <span className="k">{translate('Lab tests & diagnostics')}</span>
      <span>{(r.service_orders ?? []).length ? r.service_orders.map((o) => <LabOrderResults key={o.order_id} order={toLabOrder(o)} />) : translate('None ordered')}</span>
      <span className="k">{translate('Prescription')}</span>
      <span>
        {r.prescription?.items.length
          ? r.prescription.items.map((x) => (
              <div key={x.item_id}>
                {x.drug_label} ×{x.quantity} {x.unit}
                <span className="muted">
                  {' '}
                  · {[x.dosage, x.frequency, x.duration_days + ' ' + translate('days')].join(' · ')}
                  {x.dispense_status !== 'Dispensed' ? ' · ' + translate(x.dispense_status === 'Skipped' ? 'Skipped' : 'Waiting to dispense') : ''}
                  {x.skip_reason ? ' — ' + x.skip_reason : ''}
                </span>
              </div>
            ))
          : translate('No prescription.')}
      </span>
      {r.invoice && (
        <>
          <span className="k">{translate('Invoice')}</span>
          <span>
            <span className="num">{money(r.invoice.total_amount)}</span> · {translate(payLabel(r.invoice.payment_status))} · <span className="num muted">{r.invoice.invoice_code}</span>
          </span>
        </>
      )}
      <span className="k">{translate('Staff')}</span>
      <span>
        {translate('Reception')}: {r.nurse_name ?? '—'} · {translate('Doctor')}: {r.physician_name ?? '—'}
      </span>
      {v.outcome === 'Referred' && v.referral && (
        <div style={{ gridColumn: '1 / -1' }}>
          <ReferralBox record={r} onSaved={() => getVisitRecord(visitId).then(setR, () => {})} />
        </div>
      )}
    </>
  )
}
