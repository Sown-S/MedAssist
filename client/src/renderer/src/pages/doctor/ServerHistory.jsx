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

// Lịch sử khám của một bệnh nhân lấy từ server (FR04): mỗi lượt có chẩn đoán đã xác nhận và tóm tắt đơn thuốc;
// bấm vào một lượt để xem đầy đủ (sinh hiệu, lời kể, ghi chú lâm sàng, liều dùng, hóa đơn). Dùng ở Tra cứu hồ sơ
// và trong phiếu khám (excludeVisitId = lượt đang khám). onLoaded(history) để trang cha lấy thông tin bệnh nhân.
const PAGE = 10
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const money = (n) => (Number(n) || 0).toLocaleString('vi-VN') + 'đ'
const TONE = { Finished: 'ok', Cancelled: 'muted', Prescribed: 'warn', Examining: 'info' }

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
  return (
    <div>
      <div className="ai-toolbar">
        <div className="section-label" style={{ margin: 0 }}>
          Visits <span className="itab-cnt">{Math.max(0, total - (items.some((v) => v.visit_id === excludeVisitId) ? 1 : 0))}</span>
        </div>
        <label className="ai-small ai-soft" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={withCancelled} onChange={(e) => setWithCancelled(e.target.checked)} /> <span>Show cancelled visits</span>
        </label>
      </div>
      {err && <div className="kb-error">{err}</div>}
      {!list.length && !loading && !err && <p className="ai-soft" style={{ fontSize: 13 }}>No earlier visits in the system.</p>}
      <div className="timeline">
        {list.map((v) => (
          <div key={v.visit_id} className="emr-visit">
            <button className="emr-visit-head" onClick={() => setOpen(open === v.visit_id ? null : v.visit_id)}>
              <span className="mono ai-small">{fmt(v.visit_date)}</span>
              <span className={'badge ' + (TONE[v.status] ?? '')}>{translate(VISIT_STATUS_LABEL[v.status] ?? v.status)}</span>
              {v.outcome === 'Referred' && (
                <span className="badge low">
                  {translate('Referred')}
                  {v.referral_facility ? ' → ' + v.referral_facility : ''}
                </span>
              )}
              {v.is_red_flag && <span className="badge low">Red flag</span>}
              {v.triage_priority && v.triage_priority !== 'Routine' && !v.is_red_flag && <span className="badge warn">{translate(PRIORITY_LABEL[v.triage_priority] ?? v.triage_priority)}</span>}
              <span className="emr-dx">
                {v.diagnoses.length ? (
                  v.diagnoses.map((d, i) => (
                    <span key={i} className={d.is_primary ? '' : 'ai-soft'}>
                      {i > 0 && ' · '}
                      {d.icd10_code && <b className="mono">{d.icd10_code}</b>} {d.diagnosis_name}
                    </span>
                  ))
                ) : (
                  <span className="ai-soft">{v.chief_complaint}</span>
                )}
              </span>
              <span className="ai-small ai-soft">{v.physician_name ?? ''}</span>
              <span className="emr-caret">{open === v.visit_id ? '▴' : '▾'}</span>
            </button>
            {v.prescription && open !== v.visit_id && (
              <div className="emr-rx-sum ai-small">
                <Icon name="clipboard" />{' '}
                {v.prescription.items.map((x) => `${x.drug_label} × ${x.quantity}`).join(', ')}
              </div>
            )}
            {open === v.visit_id && <VisitDetail visitId={v.visit_id} />}
          </div>
        ))}
      </div>
      {loading && <p className="ai-soft">{translate('Loading…')}</p>}
      {!loading && items.length < total && (
        <button className="btn btn-ghost btn-sm" onClick={() => load(items.length, true)}>
          Show older visits
        </button>
      )}
    </div>
  )
}

// Lượt kết thúc bằng chuyển tuyến (ERD v2.0): nhãn "Chuyển tuyến", tóm tắt giấy, in lại; bác sĩ bổ sung giấy.
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
        <span className="badge low">
          <Icon name="ban" /> {translate('Referred')}
        </span>
        <b>{f.facility_name}</b>
        <span className="ai-small ai-soft">
          {f.reason}
          {f.transport ? ' · ' + translate(TRANSPORT_LABEL[f.transport] ?? f.transport) : ''}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          <Icon name="printer" /> {translate(doctor ? 'Amend / reprint' : 'Reprint')}
        </button>
      </div>
      {f.diagnosis && (
        <div className="ai-small">
          <span>Diagnosis</span>: {f.diagnosis}
        </div>
      )}
      {f.signs && (
        <div className="ai-small">
          <span>Warning signs</span>: {f.signs}
        </div>
      )}
      <div className="ai-small ai-soft">
        {translate(f.referred_by_role === 'Nurse' ? 'Recorded by' : 'Doctor')} {f.referred_by_name} · {fmt(f.referred_at)}
        {f.amended_by_name ? ' · ' + translate('amended by') + ' ' + f.amended_by_name + ' ' + fmt(f.amended_at) : ''}
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
  if (err) return <div className="kb-error">{err}</div>
  if (!r) return <p className="ai-soft ai-small">{translate('Loading…')}</p>
  const v = r.visit
  const vit = v.vital_signs ? vitalsText(v.vital_signs) : ''
  return (
    <div className="emr-detail">
      <div className="emr-grid">
        <div>
          <div className="section-label">Reason for visit</div>
          <div>{v.chief_complaint}</div>
          {v.free_text_description && <div className="ai-small ai-soft">{v.free_text_description}</div>}
        </div>
        <div>
          <div className="section-label">Vital signs</div>
          <div className="ai-small">{vit || '—'}</div>
        </div>
        <div>
          <div className="section-label">Staff</div>
          <div className="ai-small">
            <span>Reception</span>: {r.nurse_name ?? '—'} · <span>Doctor</span>: {r.physician_name ?? '—'}
          </div>
        </div>
      </div>
      {v.is_red_flag && v.red_flag_reason && (
        <div className="kb-error">
          <b>Red flag:</b> {v.red_flag_reason}
        </div>
      )}
      {v.outcome === 'Referred' && v.referral && <ReferralBox record={r} onSaved={() => getVisitRecord(visitId).then(setR, () => {})} />}

      <div className="section-label">Diagnoses</div>
      {r.diagnoses.length ? (
        r.diagnoses.map((d) => (
          <div key={d.diagnosis_id} className={'emr-dx-row' + (d.confirmed_by_physician ? '' : ' retracted')}>
            <span className={'badge ' + (d.is_primary ? 'info' : 'muted')}>{d.is_primary ? 'Primary' : 'Secondary'}</span> {d.icd10_code && <b className="mono">{d.icd10_code}</b>} {d.diagnosis_name}
            {!d.confirmed_by_physician && <span className="ai-small ai-soft"> ({translate('withdrawn')})</span>}
            {d.clinical_notes && <div className="emr-notes">{d.clinical_notes}</div>}
          </div>
        ))
      ) : (
        <p className="ai-soft ai-small">No diagnosis recorded.</p>
      )}

      {/* ERD v2.1: phiếu chỉ định cận lâm sàng và kết quả bác sĩ ghi từ phiếu giấy. */}
      {(r.service_orders ?? []).length > 0 && (
        <>
          <div className="section-label">Lab tests &amp; diagnostics</div>
          {r.service_orders.map((o) => (
            <LabOrderResults key={o.order_id} order={toLabOrder(o)} />
          ))}
        </>
      )}

      <div className="section-label">Prescription</div>
      {r.prescription?.items.length ? (
        <table className="dt">
          <tbody>
            {r.prescription.items.map((x) => (
              <tr key={x.item_id}>
                <td>
                  <b>{x.drug_label}</b>
                  <div className="ai-small ai-soft">{[x.dosage, x.frequency, x.duration_days + ' ' + translate('days')].join(' · ')}</div>
                  {x.instruction && <div className="ai-small ai-soft">{x.instruction}</div>}
                </td>
                <td className="num mono">
                  {x.quantity} {x.unit}
                </td>
                <td>
                  <span className={'badge ' + (x.dispense_status === 'Dispensed' ? 'ok' : x.dispense_status === 'Skipped' ? 'muted' : 'warn')}>
                    {translate(x.dispense_status === 'Dispensed' ? 'Dispensed' : x.dispense_status === 'Skipped' ? 'Skipped' : 'Waiting to dispense')}
                  </span>
                  {x.skip_reason && <div className="ai-small ai-soft">{x.skip_reason}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="ai-soft ai-small">No prescription.</p>
      )}

      {r.invoice && (
        <div className="ai-small">
          <span className="section-label" style={{ display: 'inline' }}>
            Invoice
          </span>{' '}
          <span className="mono">{r.invoice.invoice_code}</span> · <b className="mono">{money(r.invoice.total_amount)}</b> ·{' '}
          <span className={'badge ' + (r.invoice.payment_status === 'Paid' ? 'ok' : r.invoice.payment_status === 'Cancelled' ? 'muted' : 'warn')}>
            {translate(r.invoice.payment_status === 'Paid' ? 'Paid' : r.invoice.payment_status === 'Cancelled' ? 'Cancelled' : 'Awaiting payment')}
          </span>
        </div>
      )}
    </div>
  )
}
