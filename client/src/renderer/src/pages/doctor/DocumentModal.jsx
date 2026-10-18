import { useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { logEvent } from '../../api/activityStore'
import { labRows } from '../../api/queueStore'
import { printHtml, esc } from '../admin/inventory/shared'
import { dmy } from '../reception/shared'

// Giấy chuyển tuyến bác sĩ in từ phòng khám / hồ sơ bệnh nhân (kể cả ca cờ đỏ bác sĩ quyết định chuyển tuyến).
// Giấy nghỉ ốm, tóm tắt bệnh án: ngoài phạm vi (đã bỏ).
// subject: { name, gender, age, patientId, phone, allergies, history, diagnosis, hpi, exam, labOrders, labResult, rx }
const REFER_REASONS = ['Beyond the clinic’s capability', 'Emergency', 'At the patient’s request']

function patientMeta(s, t) {
  return `<p class="meta">${esc(t('Patient'))}: <b>${esc(s.name)}</b> · ${esc(t(s.gender ?? ''))}${s.age !== '' && s.age != null ? ', ' + s.age + ' ' + esc(t('yrs')) : ''}${s.patientId ? ' · ' + esc(s.patientId) : ''}${s.phone ? ' · ' + esc(s.phone) : ''}</p>
    <p class="meta">${esc(t('Address'))}: ......................................................................</p>
    ${s.allergies ? `<p class="meta">${esc(t('Drug allergy'))}: <b>${esc(t(s.allergies))}</b></p>` : ''}
    ${s.history ? `<p class="meta">${esc(t('Chronic conditions'))}: ${esc(t(s.history))}</p>` : ''}`
}
const sign = (user, t) => `<p class="meta" style="margin-top:22px;text-align:right">${esc(dmy(new Date().toISOString()))}<br>${esc(t('Doctor'))}<br><small>${esc(t('(signature, full name)'))}</small><br><br><b>${esc(user.name)}</b></p>`
const labsText = (s) =>
  (s.labOrders ?? [])
    .flatMap(labRows)
    .filter((r) => r.result)
    .map((r) => r.name + ': ' + r.result)
    .concat(s.labResult ? [s.labResult] : [])
    .join('; ')

export default function DocumentModal({ subject, onClose }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const t = translate
  const [ref, setRef] = useState({
    to: '',
    reason: subject.redFlag ? REFER_REASONS[1] : REFER_REASONS[0],
    diagnosis: subject.diagnosis || '',
    summary: [subject.hpi, subject.exam, labsText(subject)].filter(Boolean).join('\n') || subject.signs || '',
    treatment: (subject.rx ?? []).map((x) => `${x.name} × ${x.qty}`).join(', '),
    condition: '',
    transport: 'Ambulance'
  })

  function log() {
    logEvent(user, 'doc.print', { target: { kind: 'patient', id: subject.patientId ?? subject.name, label: subject.name }, params: { patient: subject.name, doc: 'referral' } })
  }

  function print() {
    if (!ref.to.trim() || !ref.diagnosis.trim()) return showToast(translate('Enter where the patient is referred to and the diagnosis.'))
    printHtml(
      t('Referral letter'),
      `<h1>${esc(t('Referral letter'))}</h1>
      ${patientMeta(subject, t)}
      <p class="meta">${esc(t('Referred to'))}: <b>${esc(ref.to)}</b></p>
      <p class="meta">${esc(t('Reason for referral'))}: ${esc(t(ref.reason))}</p>
      <p class="meta">${esc(t('Diagnosis'))}: <b>${esc(ref.diagnosis)}</b></p>
      <p class="meta">${esc(t('Clinical summary'))}:<br>${esc(ref.summary).replace(/\n/g, '<br>') || '—'}</p>
      <p class="meta">${esc(t('Treatment given'))}: ${esc(ref.treatment || '—')}</p>
      <p class="meta">${esc(t('Condition at referral'))}: ${esc(ref.condition || '—')}</p>
      <p class="meta">${esc(t('Transport'))}: ${esc(t(ref.transport))}</p>
      ${sign(user, t)}`,
      'other'
    )
    log()
  }

  const setR = (p) => setRef((x) => ({ ...x, ...p }))
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Referral letter') + ' — ' + subject.name} onClose={onClose} />
      <div className="modal-body">

        {(
          <div className="form-grid cols-2">
            <div className="field">
              <label>
                Referred to <span className="req">*</span>
              </label>
              <input type="text" autoFocus value={ref.to} onChange={(e) => setR({ to: e.target.value })} placeholder="e.g. Emergency department, Provincial General Hospital" />
            </div>
            <div className="field">
              <label>Reason for referral</label>
              <select value={ref.reason} onChange={(e) => setR({ reason: e.target.value })}>
                {REFER_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>
                Diagnosis <span className="req">*</span>
              </label>
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
                {['Ambulance', 'Family vehicle', 'On their own'].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
        <button className="btn btn-primary" onClick={print}>
          <Icon name="printer" /> Print
        </button>
      </div>
    </Modal>
  )
}
