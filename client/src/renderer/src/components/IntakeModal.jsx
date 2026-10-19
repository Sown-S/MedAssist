import { useEffect, useState } from 'react'
import Modal, { ModalHeader } from './Modal'
import { useToast } from '../context/ToastContext'
import Icon from './Icon'
import { useAuth } from '../context/AuthContext'
import { createVisit, activeVisitOf, staleVisitOf, nextTicket, recordRedFlag } from '../api/queueStore'
import { triage, TRIAGE_LEVELS, missingLabel } from '../api/triage'
import { useAIConfig } from '../api/aiConfigStore'
import { VITAL_KEYS, checkVitals, vitalsFromForm, RULE_KEY_TO_VITAL } from '../api/vitals'
import { toPayload } from '../api/symptoms'
import VitalsFields from './VitalsFields'
import SymptomPanel from './SymptomPanel'
import { registerPatient, findDuplicates, ageOf, updatePatientAdmin, idNumberOwner, setPregnancy } from '../api/patientStore'
import { translate } from '../i18n'
import { printTicket, ticketNo } from './queuePrint'
import PatientAlerts from './PatientAlerts'

const PHONE_RE = /^0\d{9}$/
const DOB_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/
const ID_RE = /^\d{12}$/ // CCCD 12 số — không bắt buộc
const VITALS_EMPTY = Object.fromEntries(VITAL_KEYS.map((d) => [d.key, '']))
const EMPTY = { name: '', dob: '', gender: 'Female', phone: '', idNumber: '', history: '', allergies: '', ...VITALS_EMPTY, days: '', pregnancy: '', reason: '', ticket: '' }

// Kiểm tra sinh hiệu theo khoảng của vital_signs.schema.json (api/vitals.js) — dùng chung với màn sửa lượt chờ.
export function vitalCheck(f) {
  const r = checkVitals(f)
  return { errors: r.errors.map((e) => e.msg), errorKeys: new Set(r.errors.map((e) => e.key)), warnings: r.warnings }
}
// Hỏi tình trạng mang thai khi là nữ trong tuổi sinh sản.
const askPregnancy = (gender, age) => gender === 'Female' && age !== '' && age >= 12 && age <= 55

// Hai cách dùng:
//  - patient = null    → đăng ký bệnh nhân mới (kiểm tra trùng SĐT / họ tên + ngày sinh trước khi tạo) rồi cấp số.
//  - patient = {...}   → tiếp đón bệnh nhân cũ: thông tin hành chính chỉ đọc, chỉ nhập lý do khám, triệu chứng, sinh hiệu.
// Mức ưu tiên do luật đặt (backend: POST /visits/{id}/assessment) — lễ tân không tự nâng tay.
// onRedFlag(patient) — mở cảnh báo dấu hiệu nguy hiểm, kèm thông tin đang nhập để ghi nhận chuyển tuyến.
export default function IntakeModal({ open, onClose, onRedFlag, patient = null }) {
  const { showToast } = useToast()
  const { user } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [syms, setSyms] = useState({}) // triệu chứng ĐÃ XÁC NHẬN: { mã: { state, source } }
  const [print, setPrint] = useState(true)
  const [touched, setTouched] = useState(false)
  const [dupes, setDupes] = useState(null) // danh sách hồ sơ có thể trùng → hỏi lại trước khi tạo mới
  const [existing, setExisting] = useState(patient)
  const [editing, setEditing] = useState(false) // sửa thông tin hành chính của hồ sơ cũ

  // Mỗi lần mở: form trống (hoặc hồ sơ được chọn từ Tra cứu).
  useEffect(() => {
    if (!open) return
    setForm({ ...EMPTY, pregnancy: patient?.pregnancy ?? '' })
    setSyms({})
    setEditing(false)
    setTouched(false)
    setDupes(null)
    setExisting(patient)
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
  // Cổng cờ đỏ chạy ngay trên dữ liệu ĐÃ XÁC NHẬN (triệu chứng ba trạng thái + sinh hiệu + tuổi) — luật tất định, không LLM.
  useAIConfig()
  const states = Object.fromEntries(Object.entries(syms).map(([k, x]) => [k, x.state]))
  const vitals = vitalsFromForm(form)
  const tri = triage({ states, age, days: form.days, vitals })
  const emergency = tri.level === 'emergency'
  const askSymptoms = tri.needNow.filter((k) => k.startsWith('sym:')).map((k) => k.slice(4))
  const askVitals = new Set(tri.needNow.map((k) => RULE_KEY_TO_VITAL[k]).filter(Boolean))
  const redSigns = () => [form.reason.trim(), ...tri.red.map((f) => f.rule.rationale)].filter(Boolean).join(' — ')
  const draft = () =>
    existing ?? { name: form.name.trim(), gender: form.gender, age: ageOf(form.dob), allergies: form.allergies.trim(), history: form.history.trim() }

  function finish(p) {
    const busy = activeVisitOf(p.id)
    if (busy) return showToast(`${p.name} is already in today’s queue — no. ${ticketNo(busy.ticket)}`)
    const old = staleVisitOf(p.id)
    if (old) return showToast(translate('This patient still has an open visit from') + ' ' + old.carriedFrom.split('-').reverse().join('/') + ' — ' + translate('close it or collect payment first (banner at the top of Reception).'))
    // TODO: khi có API thật — POST /visits; server cấp số thứ tự.
    // Mang thai lưu ở hồ sơ bệnh nhân (medical_history.is_pregnant), không ở lượt khám.
    if (existing && pregnancyAsked) setPregnancy(existing.id, form.pregnancy, user)
    const r = createVisit(
      p,
      {
        reason: form.reason,
        symptoms: toPayload(syms),
        days: form.days,
        vitals,
        pregnancy: pregnancyAsked ? form.pregnancy : '',
        priority: tri.level !== 'routine',
        triage: tri.level,
        triageRules: [...tri.red, ...tri.high].map((f) => f.rule.id),
        ticket: ''
      },
      user
    )
    if (!r.ok) return showToast(r.error)
    const v = r.visit
    // Cờ đỏ nhưng chưa chuyển viện → lên đầu hàng chờ ở mức Cấp cứu, bác sĩ nhận thông báo đỏ để khám ngay.
    if (emergency) recordRedFlag({ id: p.id, name: p.name, gender: p.gender, age: ageOf(p.dob), allergies: p.allergies, history: p.history, signs: redSigns(), visitId: v.id }, user, 'queued')
    // Số thứ tự do hệ thống cấp; máy quầy in phiếu số để đưa bệnh nhân.
    if (print) printTicket(v)
    onClose()
    showToast(emergency ? translate('Emergency — placed at the top of the queue; doctors have been alerted') + ' · ' + ticketNo(v.ticket) : `Visit created — queue number ${ticketNo(v.ticket)}`)
  }

  function handleSave(force = false) {
    setTouched(true)
    if (vit.errors.length) return showToast(translate('Check the vital signs') + ': ' + vit.errors.map((e) => translate(e)).join('; '))
    if (child && !String(form.weight_kg).trim()) return showToast(translate('Enter the child’s weight (kg) — it is needed for the prescription.'))
    if (existing) return finish(existing)
    if (invalid) return
    // CCCD đã thuộc hồ sơ khác → dùng hồ sơ đó (server trả 409 DUPLICATE_ID_NUMBER).
    const owner = idNumberOwner(form.idNumber)
    if (owner) return setDupes([owner])
    if (!force) {
      const d = findDuplicates(form)
      if (d.length) return setDupes(d)
    }
    finish(registerPatient({ ...form, pregnancy: pregnancyAsked ? form.pregnancy : '' }, user))
  }

  const err = (k) => touched && errors[k]

  return (
    <Modal open={open} onClose={onClose} wide>
      <ModalHeader title={existing ? translate('New visit') + ' — ' + existing.name : 'Register new patient & create visit'} onClose={onClose} />

      {existing ? (
        <>
          <div className="pl-summary">
            <span className="mono">{existing.id}</span>
            <span>{translate(existing.gender)}</span>
            <span>
              {existing.dob} ({ageOf(existing.dob)} {translate('yrs')})
            </span>
            <span className="mono">{existing.phone}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(!editing)}>
              <Icon name="pencil" /> {editing ? translate('Close') : translate('Edit details')}
            </button>
          </div>
          {editing && <EditPatient p={existing} onSaved={(p) => (setExisting(p), setEditing(false))} />}
          <PatientAlerts p={existing} />
        </>
      ) : (
        <>
          <div className="section-label" style={{ marginTop: 0 }}>
            Patient details
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Full name *</label>
              <input type="text" placeholder="Nguyễn Văn A" className={err('name') ? 'field-error' : ''} autoFocus {...field('name')} />
            </div>
            <div className="field">
              <label>Date of birth *</label>
              <input type="text" placeholder="dd/mm/yyyy" className={err('dob') ? 'field-error' : ''} {...field('dob')} />
              <div className={'field-error-msg' + (err('dob') ? ' show' : '')}>Enter a valid date (dd/mm/yyyy)</div>
            </div>
            <div className="field">
              <label>Gender</label>
              <select {...field('gender')}>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
            </div>
            <div className="field">
              <label>Phone number *</label>
              <input type="text" placeholder="09xx xxx xxx" className={err('phone') ? 'field-error' : ''} {...field('phone')} />
              <div className={'field-error-msg' + (err('phone') ? ' show' : '')}>Invalid phone number (10 digits required)</div>
            </div>
            <div className="field">
              <label>ID card number (CCCD)</label>
              <input type="text" inputMode="numeric" placeholder="0xx xxx xxx xxx" className={err('idNumber') ? 'field-error' : ''} {...field('idNumber')} />
              <div className={'field-error-msg' + (err('idNumber') ? ' show' : '')}>12 digits, or leave empty</div>
            </div>
            <div className="field full" style={{ gridColumn: 'span 2' }}>
              <label>Medical history (chronic conditions)</label>
              <input type="text" placeholder="Hypertension, diabetes…" {...field('history')} />
            </div>
            <div className="field">
              <label>Drug allergies</label>
              <input type="text" placeholder="Penicillin…" {...field('allergies')} />
            </div>
          </div>
        </>
      )}

      {dupes && !existing && (
        <div className="warn-banner show caution">
          <div className="icon">
            <Icon name="alert" />
          </div>
          <div className="txt" style={{ flex: 1 }}>
            <b>This patient may already have a record</b>
            <span>Same phone number, or same name and date of birth. Use the existing record if it is the same person.</span>
            <div className="dupe-list">
              {dupes.map((d) => (
                <div className="dupe-row" key={d.id}>
                  <span className="mono">{d.id}</span>
                  <b>{d.name}</b>
                  <span>{d.dob}</span>
                  <span className="mono">{d.phone}</span>
                  <button className="btn btn-primary btn-sm" onClick={() => setExisting(d)}>
                    Use this record
                  </button>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => handleSave(true)}>
              Not the same person — create a new record
            </button>
          </div>
        </div>
      )}

      <div className="section-label">Symptoms</div>
      <SymptomPanel value={syms} onChange={setSyms} text={form.reason} onText={(t) => setForm((f) => ({ ...f, reason: t }))} ask={askSymptoms} />

      <div className="section-label">Vital signs</div>
      <VitalsFields value={form} onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} errorKeys={touched ? vit.errorKeys : new Set()} requireWeight={child} highlight={askVitals} />
      <div className="form-grid" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Symptom duration (days)</label>
          <input type="text" inputMode="numeric" placeholder={translate('optional')} {...field('days')} />
        </div>
        {pregnancyAsked && (
          <div className="field">
            <label>Pregnancy</label>
            <select {...field('pregnancy')}>
              <option value="">Not asked</option>
              <option value="no">Not pregnant</option>
              <option value="yes">Pregnant</option>
            </select>
          </div>
        )}
        <div className="field">
          <label>Queue number</label>
          <input type="text" readOnly value={ticketNo(nextTicket())} title={translate('Issued by the server when the visit is saved')} />
        </div>
      </div>
      {touched && vit.errors.length > 0 && (
        <p className="ai-soft" style={{ color: '#FCA5A5', fontSize: 12.5, margin: '4px 0 8px' }}>
          <Icon name="ban" /> {vit.errors.map((w) => translate(w)).join(' · ')}
        </p>
      )}
      {vWarn.length > 0 && (
        <p className="ai-soft" style={{ color: '#FCD34D', fontSize: 12.5, margin: '4px 0 8px' }}>
          <Icon name="alert" /> {translate('Unusual value — please double-check')}: {vWarn.map((w) => translate(w)).join(' · ')}
        </p>
      )}
      <TriageStrip tri={tri} onTransfer={() => onRedFlag({ ...draft(), id: existing?.id, signs: redSigns() })} />
      <label className="set-checks" style={{ display: 'flex', marginTop: 8, fontSize: 13.5 }}>
        <input type="checkbox" checked={print} onChange={(e) => setPrint(e.target.checked)} />{' '}
        <span>Print queue ticket</span>
      </label>

      <div className="form-actions">
        <button className="btn btn-ghost" style={{ color: 'var(--warn)', borderColor: '#F3C9C9' }} onClick={() => onRedFlag({ ...draft(), id: existing?.id, signs: redSigns() })}>
          <Icon name="ban" /> Emergency warning signs
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => handleSave(false)} disabled={touched && invalid && !existing}>
          {emergency ? translate('Save — top of the queue (Emergency)') : existing ? 'Create visit & issue number' : 'Save & issue number'}
        </button>
      </div>
    </Modal>
  )
}

// Kết quả cổng cờ đỏ ngay trong form: mức phân loại, luật đã khớp (kèm lý do), dữ liệu cần đo / hỏi ngay.
function TriageStrip({ tri, onTransfer }) {
  const lv = TRIAGE_LEVELS[tri.level]
  return (
    <div className={'triage-strip ' + tri.level}>
      <span className={'badge ' + lv.tone}>{translate(lv.label)}</span>
      <div className="txt">
        {tri.red.map((f) => (
          <span key={f.rule.id}>
            <b>{translate('Red flag')}</b> · {f.rule.rationale}
          </span>
        ))}
        {tri.high.map((f) => (
          <span key={f.rule.id}>
            <b>{translate('Priority')}</b> · {f.rule.rationale}
          </span>
        ))}
        {tri.needNow.length > 0 && (
          <span className="need">
            {translate('Measure / ask now')}: {tri.needNow.map((k) => translate(missingLabel(k))).join(', ')}
          </span>
        )}
        {tri.level === 'routine' && !tri.needNow.length && <span className="ai-soft">{translate('No red-flag or priority rule matches the confirmed symptoms and vital signs.')}</span>}
      </div>
      {tri.level === 'emergency' && (
        <button type="button" className="btn btn-sm" style={{ background: 'var(--warn)', color: '#fff' }} onClick={onTransfer}>
          <Icon name="ban" /> {translate('Transfer to hospital now')}
        </button>
      )}
    </div>
  )
}

// Sửa thông tin hành chính của hồ sơ cũ (nhập nhầm lúc đăng ký) — không tạo hồ sơ mới, ghi nhật ký trước / sau.
function EditPatient({ p, onSaved }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [f, setF] = useState({ name: p.name, phone: p.phone, dob: p.dob, gender: p.gender, idNumber: p.idNumber ?? '' })
  const bad = !f.name.trim() || !PHONE_RE.test(String(f.phone).trim()) || !DOB_RE.test(f.dob.trim()) || ageOf(f.dob) === '' || (!!String(f.idNumber).trim() && !ID_RE.test(String(f.idNumber).trim()))
  function save() {
    const r = updatePatientAdmin(p.id, f, user)
    if (!r.ok) return showToast(translate(r.error))
    showToast(r.changed ? 'Patient details updated' : 'Nothing changed')
    onSaved({ ...p, ...f, phone: String(f.phone).replace(/\D/g, ''), idNumber: String(f.idNumber).replace(/\D/g, '') })
  }
  const bind = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) })
  return (
    <div className="clin-edit">
      <div className="form-grid">
        <div className="field">
          <label>Full name *</label>
          <input type="text" {...bind('name')} />
        </div>
        <div className="field">
          <label>Date of birth *</label>
          <input type="text" placeholder="dd/mm/yyyy" {...bind('dob')} />
        </div>
        <div className="field">
          <label>Gender</label>
          <select {...bind('gender')}>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </select>
        </div>
        <div className="field">
          <label>Phone number *</label>
          <input type="text" {...bind('phone')} />
        </div>
        <div className="field">
          <label>ID card number (CCCD)</label>
          <input type="text" inputMode="numeric" {...bind('idNumber')} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-sm" disabled={bad} onClick={save}>
          <Icon name="check" /> Save changes
        </button>
      </div>
    </div>
  )
}
