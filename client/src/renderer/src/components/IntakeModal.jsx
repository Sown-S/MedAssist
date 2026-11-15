import { useEffect, useRef, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import { useToast } from '../context/ToastContext'
import Icon from './Icon'
import { syncQueue } from '../api/queueStore'
import * as clinic from '../api/clinicApi'
import { VITAL_KEYS, checkVitals, vitalsFromForm } from '../api/vitals'
import { toPayload, extractionStale } from '../api/symptoms'
import VitalsFields from './VitalsFields'
import VitalProposals from './VitalProposals'
import SymptomPanel from './SymptomPanel'
import { ageOf } from '../api/patient'
import { translate } from '../i18n'
import { printTicket, ticketNo } from './queuePrint'
import PatientAlerts from './PatientAlerts'
import { PHONE_RE, DOB_RE, ID_RE, EditPatient, NewPatientFields, DuplicateBanner } from './PatientFields'

// Sinh hiệu đề xuất + lời kể của lần trích xuất ra chúng (xem extractionStale).
const NO_VITALS = { list: [], from: null }

const VITALS_EMPTY = Object.fromEntries(VITAL_KEYS.map((d) => [d.key, '']))
const EMPTY = { name: '', dob: '', gender: 'Female', phone: '', idNumber: '', history: '', allergies: '', ...VITALS_EMPTY, pregnancy: '', reason: '', ticket: '' }

// Dùng chung với màn sửa lượt chờ.
export function vitalCheck(f) {
  const r = checkVitals(f)
  return { errors: r.errors.map((e) => e.msg), errorKeys: new Set(r.errors.map((e) => e.key)), warnings: r.warnings }
}
const askPregnancy = (gender, age) => gender === 'Female' && age !== '' && age >= 12 && age <= 55

// patient = null: đăng ký bệnh nhân mới (kiểm tra trùng trước khi tạo) rồi cấp số.
// patient có sẵn: tiếp đón bệnh nhân cũ, thông tin hành chính chỉ đọc. Mức ưu tiên do luật đặt, lễ tân không nâng tay.
export default function IntakeModal({ open, onClose, onRedFlag, patient = null }) {
  const { showToast } = useToast()
  const [form, setForm] = useState(EMPTY)
  const [syms, setSyms] = useState({})
  const [print, setPrint] = useState(true)
  const [touched, setTouched] = useState(false)
  const [dupes, setDupes] = useState(null)
  const [existing, setExisting] = useState(patient)
  const [editing, setEditing] = useState(false)
  // Lượt khám được tạo sớm (khi trích xuất hoặc khi lưu) — server cấp số ngay.
  const [busy, setBusy] = useState(false)
  const [visit, setVisit] = useState(null)
  const [idTaken, setIdTaken] = useState(false)
  const visitRef = useRef(null)
  // Chờ y tá xác nhận, không tự điền.
  const [vitalProps, setVitalProps] = useState(NO_VITALS)
  const saved = useRef(false)

  useEffect(() => {
    if (!open) return
    setForm({ ...EMPTY, pregnancy: patient?.pregnancy ?? '' })
    setSyms({})
    setEditing(false)
    setTouched(false)
    setDupes(null)
    setExisting(patient)
    setVisit(null)
    setIdTaken(false)
    setVitalProps(NO_VITALS)
    visitRef.current = null
    saved.current = false
  }, [open, patient])

  const field = (k) => ({ value: form[k], onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })) })
  const errors = existing
    ? {}
    : {
        name: !form.name.trim(),
        phone: !PHONE_RE.test(form.phone.trim()),
        dob: !DOB_RE.test(form.dob.trim()) || ageOf(form.dob) === '',
        idNumber: !!form.idNumber.trim() && !ID_RE.test(form.idNumber.trim())
      }
  const vit = vitalCheck(form)
  const invalid = Object.values(errors).some(Boolean)
  const vWarn = vit.warnings
  const age = existing ? ageOf(existing.dob) : ageOf(form.dob)
  const child = age !== '' && age < 12
  const pregnancyAsked = askPregnancy(existing ? existing.gender : form.gender, age)
  // Luật cờ đỏ / ưu tiên chạy ở server khi lưu (POST /visits/{id}/assessment).
  const vitals = vitalsFromForm(form)
  const draft = () => existing ?? { name: form.name.trim(), gender: form.gender, age: ageOf(form.dob), allergies: form.allergies.trim(), history: form.history.trim() }

  // Tạo hồ sơ + lượt Waiting nếu chưa có; lần sau chỉ cập nhật lời kể và sinh hiệu (chỉ khi còn Waiting).
  async function ensureVisit(force = false) {
    if (visitRef.current) {
      await clinic.updateVisit(visitRef.current.visit_id, { text: form.reason, vitals })
      return visitRef.current
    }
    let p = existing
    if (!p) {
      const r = await clinic.createPatient({ ...form, pregnancy: pregnancyAsked ? form.pregnancy : '' }, { confirmDuplicate: force })
      if (!r.ok) {
        setDupes(r.duplicates)
        setIdTaken(!!r.idTaken)
        return null
      }
      p = r.patient
      setExisting(p)
      setDupes(null)
    } else if (pregnancyAsked) await clinic.setPregnancy(p, form.pregnancy)
    const v = await clinic.createVisit(p.id, { text: form.reason, vitals })
    visitRef.current = v
    setVisit(v)
    syncQueue()
    return v
  }
  // Chuyển tuyến cấp cứu cần hồ sơ bệnh nhân — bệnh nhân mới thì tạo hồ sơ trước.
  async function ensurePatientId() {
    if (existing) return existing.id
    setTouched(true)
    if (invalid) {
      showToast(translate('Fill in the patient’s name, date of birth and phone first.'), 'error')
      return null
    }
    const r = await clinic.createPatient({ ...form, pregnancy: pregnancyAsked ? form.pregnancy : '' }, { confirmDuplicate: false })
    if (!r.ok) {
      setDupes(r.duplicates)
      setIdTaken(!!r.idTaken)
      showToast(translate('This patient may already have a record — choose it in the form, then refer again.'), 'error')
      return null
    }
    setExisting(r.patient)
    return r.patient.id
  }
  // Chuyển tuyến cần lượt / hồ sơ trên server.
  const redFlagInfo = () => ({
    ...draft(),
    id: existing?.id,
    signs: form.reason.trim(),
    visitId: visitRef.current?.visit_id,
    chief: form.reason,
    vitals,
    ensurePatient: ensurePatientId
  })
  function checkForm() {
    setTouched(true)
    if (vit.errors.length) {
      showToast(translate('Check the vital signs') + ': ' + vit.errors.map((e) => translate(e)).join('; '), 'error')
      return false
    }
    if (child && !String(form.weight_kg).trim()) {
      showToast(translate('Enter the child’s weight (kg) — it is needed for the prescription.'), 'error')
      return false
    }
    return !!existing || !invalid
  }
  // Server trích xuất từ free_text_description nên phải có lượt khám đã lưu lời kể.
  async function extract(text, opts) {
    if (!checkForm()) throw Object.assign(new Error('form'), { code: 'FORM' })
    const v = await ensureVisit()
    if (!v) throw Object.assign(new Error('duplicate'), { code: 'FORM' })
    return clinic.extractSymptoms(v.visit_id, opts)
  }
  async function handleSave(force = false) {
    if (!checkForm()) return
    setBusy(true)
    try {
      const v = await ensureVisit(force)
      if (!v) return
      await clinic.putSymptoms(v.visit_id, toPayload(syms))
      // Luật cờ đỏ / ưu tiên chạy ngay trong POST; phần AI chạy nền.
      const a = await clinic.triggerAssessment(v.visit_id)
      saved.current = true
      syncQueue()
      const level = clinic.triageOf(a.priority?.final)
      const name = existing?.name ?? form.name.trim()
      if (print) printTicket({ ticket: v.queue_number, name, priority: level !== 'routine', arrivedAt: v.visit_date })
      onClose()
      const no = ticketNo(v.queue_number)
      if (level === 'emergency') showToast(translate('Emergency — placed at the top of the queue; doctors have been alerted') + ' · ' + no)
      else showToast('Visit created — queue number ' + no + (level === 'high' ? ' · ' + translate('Priority') : ''))
    } catch (e) {
      showToast(translate(e.message), 'error')
    } finally {
      setBusy(false)
    }
  }
  // Đóng khi lượt đã tạo mà chưa lưu xong → huỷ lượt đó để không còn lượt “ma” trong hàng chờ.
  function close() {
    if (visitRef.current && !saved.current)
      clinic.cancelVisit(visitRef.current.visit_id, 'Huỷ khi đang tiếp đón (chưa lưu)').then(
        () => syncQueue(),
        () => {}
      )
    onClose()
  }
  async function pickRecord(d) {
    setExisting(await clinic.getPatient(d.id))
  }

  const err = (k) => touched && errors[k]

  return (
    <Modal open={open} onClose={close} wide="xl">
      <ModalHeader title={existing ? translate('New visit') + ' — ' + existing.name : 'Register new patient & create visit'} onClose={close} />

      {/* Hai cột như mẫu: trái thông tin bệnh nhân, phải triệu chứng và sinh hiệu. */}
      <div className="modal-b flush">
        <div className="intake">
          <section>
            {existing && (
              <div className="sec-t" style={{ marginTop: 0 }}>
                Patient details
              </div>
            )}
            {existing ? (
              <>
                <div className="pl-summary">
                  <span className="num">{existing.id}</span>
                  <span>{translate(existing.gender)}</span>
                  <span>
                    {existing.dob} ({ageOf(existing.dob)} {translate('yrs')})
                  </span>
                  <span className="num">{existing.phone}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(!editing)}>
                    <Icon name="pencil" /> {editing ? translate('Close') : translate('Edit details')}
                  </button>
                </div>
                {editing && <EditPatient p={existing} onSaved={(p) => (setExisting(p), setEditing(false))} />}
                <PatientAlerts p={existing} />
              </>
            ) : (
              <>
                <NewPatientFields form={form} field={field} err={err} onDob={(dob) => setForm((f) => ({ ...f, dob }))} />
              </>
            )}

            {dupes && !existing && <DuplicateBanner dupes={dupes} allowNew={!idTaken} onPick={pickRecord} onCreateNew={() => handleSave(true)} />}
            {pregnancyAsked && (
              <>
                <div className="sec-t">
                  <Icon name="baby" />
                  <span>Pregnancy</span>
                </div>
                <div className="seg" role="radiogroup" aria-label={translate('Pregnancy')}>
                  {[
                    ['', 'Not asked'],
                    ['no', 'Not pregnant'],
                    ['yes', 'Pregnant']
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={form.pregnancy === v}
                      className={form.pregnancy === v ? 'on' : ''}
                      onClick={() => setForm((f) => ({ ...f, pregnancy: v }))}
                    >
                      {translate(l)}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="sec-t">
              <Icon name="ticket" />
              <span>Queue number</span>
            </div>
            <div className="qno">
              <span className="n num">{visit ? ticketNo(visit.queue_number) : '—'}</span>
              <div style={{ flex: 1 }}>
                <b>{visit ? translate('Queue number') + ' ' + ticketNo(visit.queue_number) : translate('Issued when saved')}</b>
                <div className="muted small">{translate('Issued by the server when the visit is saved')}</div>
              </div>
              <label className="check">
                <input type="checkbox" checked={print} onChange={(e) => setPrint(e.target.checked)} />
                <span>Print queue ticket</span>
              </label>
            </div>
          </section>

          <section>
            <div className="sec-t" style={{ marginTop: 0 }}>
              <Icon name="message-square-text" />
              <span>Symptoms</span>
            </div>
            <SymptomPanel
              value={syms}
              onChange={setSyms}
              text={form.reason}
              onText={(t) => setForm((f) => ({ ...f, reason: t }))}
              onExtract={extract}
              onVitals={(list, from) => setVitalProps({ list, from })}
            />

            <div className="sec-t">
              <Icon name="activity" />
              <span>Vital signs</span>
            </div>
            <VitalProposals
              list={vitalProps.list}
              form={form}
              onApply={(fill) => setForm((f) => ({ ...f, ...fill }))}
              onDrop={(keys) => setVitalProps((v) => ({ ...v, list: v.list.filter((p) => !keys.includes(p.key)) }))}
              stale={extractionStale(vitalProps.from, form.reason)}
            />
            <VitalsFields value={form} onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} errorKeys={touched ? vit.errorKeys : new Set()} requireWeight={child} />
            {touched && vit.errors.length > 0 && (
              <p className="ai-soft" style={{ color: 'var(--warn-ink)', fontSize: 12.5, margin: '4px 0 8px' }}>
                <Icon name="ban" /> {vit.errors.map((w) => translate(w)).join(' · ')}
              </p>
            )}
            {vWarn.length > 0 && (
              <p className="ai-soft" style={{ color: 'var(--priority-ink)', fontSize: 12.5, margin: '4px 0 8px' }}>
                <Icon name="alert" /> {translate('Unusual value — please double-check')}: {vWarn.map((w) => translate(w)).join(' · ')}
              </p>
            )}
          </section>
        </div>
      </div>

      <div className="modal-f">
        {!existing && (
          <span className="muted small">
            <Icon name="info" /> {translate('Fill in the name, date of birth and phone number first.')}
          </span>
        )}
        <span className="sp" />
        <button className="btn btn-danger-outline" onClick={() => onRedFlag(redFlagInfo())}>
          <Icon name="siren" />
          {translate('Emergency warning signs')}
        </button>
        <button className="btn btn-outline" onClick={close}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => handleSave(false)} disabled={busy || (touched && invalid && !existing)}>
          <Icon name="ticket" />
          {translate(existing ? 'Create visit & issue number' : 'Save & issue number')}
        </button>
      </div>
    </Modal>
  )
}
