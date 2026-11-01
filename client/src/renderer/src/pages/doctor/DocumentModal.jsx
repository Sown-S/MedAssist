import { useEffect, useRef, useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { VI } from '../../i18n/vi'
import { labRows, syncQueue } from '../../api/queueStore'
import { searchFacilities, referVisit, emergencyReferral, updateReferral } from '../../api/clinicApi'
import { apiMessage } from '../../api/serviceStore'
import { printHtml, esc } from '../admin/inventory/shared'
import { dmy } from '../reception/shared'

// Giấy chuyển tuyến. Chuyển tuyến kết thúc lượt khám và lưu ở server (ERD v2.0). mode:
// 'print' chỉ điền và in, không lưu · 'doctor' chuyển lượt đang khám (PATCH /visits/{id}/refer) · 'desk' lễ tân chuyển lượt
// đang chờ hoặc cấp cứu ngay ở quầy (POST /visits/emergency-referral) · 'amend' bác sĩ bổ sung giấy đã chuyển ·
// 'reprint' xem và in lại (không sửa được).
// target: { visitId, ensurePatient: async () => patientId, chief, vitals }
const REFER_REASONS = ['Beyond the clinic’s capability', 'Emergency', 'At the patient’s request']
// Nhãn giao diện ↔ giá trị server.
const TRANSPORTS = [
  ['Ambulance', 'Ambulance'],
  ['Family vehicle', 'Family'],
  ['On their own', 'Self'],
  ['Other', 'Other']
]
const transportLabel = (v) => TRANSPORTS.find(([, s]) => s === v)?.[0] ?? 'Ambulance'
// Server lưu lý do bằng tiếng Việt → tìm lại nhãn gốc để chọn trong danh sách.
const reasonLabel = (text) => REFER_REASONS.find((r) => r === text || VI[r] === text) ?? text

function patientMeta(s, t) {
  return `<p class="meta">${esc(t('Patient'))}: <b>${esc(s.name)}</b> · ${esc(t(s.gender ?? ''))}${s.age !== '' && s.age != null ? ', ' + s.age + ' ' + esc(t('yrs')) : ''}${s.patientId ? ' · ' + esc(s.patientId) : ''}${s.phone ? ' · ' + esc(s.phone) : ''}</p>
    <p class="meta">${esc(t('Address'))}: ......................................................................</p>
    ${s.allergies ? `<p class="meta">${esc(t('Drug allergy'))}: <b>${esc(t(s.allergies))}</b></p>` : ''}
    ${s.history ? `<p class="meta">${esc(t('Chronic conditions'))}: ${esc(t(s.history))}</p>` : ''}`
}
const sign = (name, role, t) =>
  `<p class="meta" style="margin-top:22px;text-align:right">${esc(dmy(new Date().toISOString()))}<br>${esc(t(role))}<br><small>${esc(t('(signature, full name)'))}</small><br><br><b>${esc(name)}</b></p>`
const labsText = (s) =>
  (s.labOrders ?? [])
    .flatMap(labRows)
    .filter((r) => r.result)
    .map((r) => r.name + ': ' + r.result)
    .concat(s.labResult ? [s.labResult] : [])
    .join('; ')

export default function DocumentModal({ subject, onClose, mode = 'print', target = {}, onDone }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const t = translate
  const old = subject.referral ?? null
  const desk = mode === 'desk'
  const [busy, setBusy] = useState(false)
  const [ref, setRef] = useState(() =>
    old
      ? {
          to: old.facility_name ?? '',
          facilityId: old.facility_id ?? null,
          reason: reasonLabel(old.reason ?? REFER_REASONS[0]),
          diagnosis: old.diagnosis ?? subject.diagnosis ?? '',
          summary: old.summary ?? '',
          treatment: old.treatment ?? '',
          condition: old.condition ?? '',
          transport: transportLabel(old.transport),
          signs: old.signs ?? ''
        }
      : {
          to: '',
          facilityId: null,
          reason: subject.redFlag || desk ? REFER_REASONS[1] : REFER_REASONS[0],
          diagnosis: subject.diagnosis || '',
          summary: [subject.hpi, subject.exam, labsText(subject)].filter(Boolean).join('\n') || (desk ? '' : subject.signs || ''),
          treatment: (subject.rx ?? []).map((x) => `${x.name} × ${x.qty}`).join(', '),
          condition: '',
          transport: 'Ambulance',
          signs: subject.signs || ''
        }
  )
  const setR = (p) => setRef((x) => ({ ...x, ...p }))
  const reasons = REFER_REASONS.includes(ref.reason) ? REFER_REASONS : [...REFER_REASONS, ref.reason]

  function log() {
  }

  // Người ký: bác sĩ, hoặc người ghi nhận ở quầy.
  function print(by = old?.referred_by_name ?? user.name, role = desk || old?.referred_by_role === 'Nurse' ? 'Recorded by' : 'Doctor') {
    printHtml(
      t('Referral letter'),
      `<h1>${esc(t('Referral letter'))}</h1>
      ${patientMeta(subject, t)}
      <p class="meta">${esc(t('Referred to'))}: <b>${esc(ref.to)}</b></p>
      <p class="meta">${esc(t('Reason for referral'))}: ${esc(t(ref.reason))}</p>
      <p class="meta">${esc(t('Diagnosis'))}: <b>${esc(ref.diagnosis || '—')}</b></p>
      ${ref.signs ? `<p class="meta">${esc(t('Warning signs'))}: ${esc(ref.signs)}</p>` : ''}
      <p class="meta">${esc(t('Clinical summary'))}:<br>${esc(ref.summary).replace(/\n/g, '<br>') || '—'}</p>
      <p class="meta">${esc(t('Treatment given'))}: ${esc(ref.treatment || '—')}</p>
      <p class="meta">${esc(t('Condition at referral'))}: ${esc(ref.condition || '—')}</p>
      <p class="meta">${esc(t('Transport'))}: ${esc(t(ref.transport))}</p>
      ${sign(by, role, t)}`,
      'other'
    )
    log()
  }

  const problem = !ref.to.trim()
    ? 'Enter where the patient is referred to and the diagnosis.'
    : !desk && !ref.diagnosis.trim()
      ? 'Enter where the patient is referred to and the diagnosis.'
      : null

  // Đúng các trường server nhận (ReferralIn); lý do ghi tiếng Việt.
  const body = () => ({
    ...(ref.facilityId ? { facility_id: ref.facilityId } : {}),
    facility_name: ref.to.trim(),
    reason: VI[ref.reason] ?? ref.reason,
    diagnosis: ref.diagnosis.trim() || null,
    summary: ref.summary.trim() || null,
    treatment: ref.treatment.trim() || null,
    condition: ref.condition.trim() || null,
    transport: TRANSPORTS.find(([l]) => l === ref.transport)?.[1] ?? 'Other',
    ...(desk && ref.signs.trim() ? { signs: ref.signs.trim() } : {})
  })

  async function submit() {
    if (problem) return showToast(translate(problem), 'error')
    setBusy(true)
    try {
      if (mode === 'amend') {
        const { signs, ...b } = body()
        await updateReferral(target.visitId, b)
      } else if (target.visitId) await referVisit(target.visitId, body())
      else {
        const pid = await target.ensurePatient?.()
        if (!pid) return
        await emergencyReferral(pid, (target.chief || '').trim() || 'Cấp cứu', body(), target.vitals && Object.keys(target.vitals).length ? target.vitals : undefined)
      }
      if (mode === 'amend') print(user.name, 'Doctor')
      else print()
      await syncQueue()
      showToast(
        mode === 'amend'
          ? 'Referral letter updated'
          : desk
            ? 'Referral recorded — send the patient to hospital now; the visit is closed'
            : 'Referred — the visit is closed (no invoice)'
      )
      onDone?.()
      onClose()
    } catch (e) {
      showToast(translate(apiMessage(e)), 'error')
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'doctor' ? 'Refer & end the visit' : desk ? 'Emergency referral' : 'Referral letter'
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate(title) + ' — ' + subject.name} onClose={onClose} />
      <div className="modal-body">
        {mode === 'doctor' && <p className="ai-hint">The visit ends as “Referred”: no prescription, no invoice. You can add to the letter later from the patient’s record.</p>}
        {desk && <p className="ai-hint">Send the patient to hospital now (call 115 if needed). The visit is closed as “Referred” and doctors can complete the letter later.</p>}
        <fieldset className="form-grid cols-2 doc-fields" disabled={mode === 'reprint'}>
          <div className="field">
            <label>
              Referred to <span className="req">*</span>
            </label>
            {mode === 'print' || mode === 'reprint' ? (
              <input type="text" autoFocus value={ref.to} onChange={(e) => setR({ to: e.target.value })} placeholder="e.g. Emergency department, Provincial General Hospital" />
            ) : (
              <FacilityInput value={ref.to} onChange={(to, facilityId = null) => setR({ to, facilityId })} />
            )}
          </div>
          <div className="field">
            <label>Reason for referral</label>
            <select value={ref.reason} onChange={(e) => setR({ reason: e.target.value })}>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {desk && (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Warning signs</label>
              <input type="text" value={ref.signs} onChange={(e) => setR({ signs: e.target.value })} placeholder="e.g. Crushing chest pain, sweating" />
            </div>
          )}
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Diagnosis {!desk && <span className="req">*</span>}</label>
            <input type="text" value={ref.diagnosis} onChange={(e) => setR({ diagnosis: e.target.value })} />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Clinical summary</label>
            <textarea className="doc-ta" rows="3" value={ref.summary} onChange={(e) => setR({ summary: e.target.value })} />
          </div>
          <div className="field">
            <label>Treatment given</label>
            <input type="text" value={ref.treatment} onChange={(e) => setR({ treatment: e.target.value })} />
          </div>
          <div className="field">
            <label>Condition at referral</label>
            <input type="text" value={ref.condition} onChange={(e) => setR({ condition: e.target.value })} placeholder="e.g. Conscious, BP 90/60, SpO2 93%" />
          </div>
          <div className="field">
            <label>Transport</label>
            <select value={ref.transport} onChange={(e) => setR({ transport: e.target.value })}>
              {TRANSPORTS.map(([x]) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
        {mode === 'amend' && (
          <button className="btn btn-ghost" onClick={() => print()}>
            <Icon name="printer" /> Reprint
          </button>
        )}
        {mode === 'reprint' ? (
          <button className="btn btn-primary" onClick={() => print()}>
            <Icon name="printer" /> Reprint
          </button>
        ) : mode === 'print' ? (
          <button className="btn btn-primary" onClick={() => (problem ? showToast(translate(problem), 'error') : print(user.name))}>
            <Icon name="printer" /> Print
          </button>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            <Icon name="printer" />{' '}
            {mode === 'doctor' ? 'Print & end the visit (referred)' : mode === 'amend' ? 'Save & print' : 'Record the referral & print'}
          </button>
        )}
      </div>
    </Modal>
  )
}

// Gợi ý từ danh mục cơ sở nhận chuyển tuyến (gõ không dấu, từ 2 ký tự), vẫn nhập tự do được.
function FacilityInput({ value, onChange }) {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const seq = useRef(0)
  useEffect(() => {
    const q = value.trim()
    if (q.length < 2) return setList([])
    const n = ++seq.current
    const timer = setTimeout(() => {
      searchFacilities(q, 8).then(
        (r) => n === seq.current && setList(r),
        () => n === seq.current && setList([])
      )
    }, 250)
    return () => clearTimeout(timer)
  }, [value])
  return (
    <div className="fac-input">
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Type a hospital name, e.g. bach mai"
      />
      {open && list.length > 0 && (
        <div className="fac-list">
          {list.map((f) => (
            <button
              type="button"
              key={f.facility_id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(f.name, f.facility_id)
                setOpen(false)
              }}
            >
              <b>{f.name}</b>
              <small>
                {f.province}
                {f.tech_level ? ' · ' + f.tech_level : ''}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
