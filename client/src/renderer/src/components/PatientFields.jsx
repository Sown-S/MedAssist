import { useRef, useState } from 'react'
import { useToast } from '../context/ToastContext'
import Icon from './Icon'
import * as clinic from '../api/clinicApi'
import { ageOf } from '../api/patient'
import { todayISO } from '../api/inventoryStore'
import { translate } from '../i18n'

// Ô thông tin hành chính của bệnh nhân dùng ở màn tiếp đón: nhập mới, sửa, cảnh báo hồ sơ có thể trùng.
export const PHONE_RE = /^0\d{9}$/
export const DOB_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/
export const ID_RE = /^\d{12}$/

// Hiển thị dd/mm/yyyy cố định: ô date gốc của Chromium theo vùng của Windows (máy en-US thành mm/dd/yyyy).
// Nút lịch mở bảng chọn ngày gốc, không cho chọn ngày tương lai.
export function DobInput({ value, onChange, className }) {
  const picker = useRef(null)
  return (
    <div className="dob-input">
      <input type="text" inputMode="numeric" placeholder="dd/mm/yyyy" className={className} value={value} onChange={(e) => onChange(clinic.maskDob(e.target.value))} />
      <button type="button" className="dob-cal" tabIndex={-1} title={translate('Choose from calendar')} onClick={() => picker.current?.showPicker()}>
        <Icon name="calendar" />
      </button>
      <input ref={picker} type="date" className="dob-native" tabIndex={-1} aria-hidden="true" min="1900-01-01" max={todayISO()} value={clinic.isoDob(value) ?? ''} onChange={(e) => onChange(clinic.dmyDob(e.target.value))} />
    </div>
  )
}

export function EditPatient({ p, onSaved }) {
  const { showToast } = useToast()
  const [f, setF] = useState({ name: p.name, phone: p.phone, dob: p.dob, gender: p.gender, idNumber: p.idNumber ?? '' })
  const bad = !f.name.trim() || !PHONE_RE.test(String(f.phone).trim()) || !DOB_RE.test(f.dob.trim()) || ageOf(f.dob) === '' || (!!String(f.idNumber).trim() && !ID_RE.test(String(f.idNumber).trim()))
  async function save() {
    try {
      const saved = await clinic.updatePatient(p.id, f)
      showToast('Patient details updated')
      onSaved({ ...p, ...saved })
    } catch (e) {
      showToast(translate(e.message), 'error')
    }
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
          <DobInput value={f.dob} onChange={(dob) => setF({ ...f, dob })} />
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

// Bệnh nhân mới: họ tên, ngày sinh, giới, SĐT, CCCD, dị ứng, bệnh nền. err(k) = ô k sai và đã bấm lưu.
export function NewPatientFields({ form, field, err, onDob }) {
  return (
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
          <DobInput className={err('dob') ? 'field-error' : ''} value={form.dob} onChange={onDob} />
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
        <div className="field">
          <label>Drug allergies</label>
          <input type="text" placeholder="Penicillin…" {...field('allergies')} />
        </div>
        <div className="field full">
          <label>Medical history (chronic conditions)</label>
          <input type="text" placeholder="Hypertension, diabetes…" {...field('history')} />
        </div>
      </div>
    </>
  )
}

// Cùng SĐT, hoặc cùng họ tên + ngày sinh với hồ sơ đã có. allowNew = false khi trùng CCCD (không được tạo hồ sơ mới).
export function DuplicateBanner({ dupes, allowNew, onPick, onCreateNew }) {
  return (
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
              <button className="btn btn-primary btn-sm" onClick={() => onPick(d)}>
                Use this record
              </button>
            </div>
          ))}
        </div>
        {allowNew && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={onCreateNew}>
            Not the same person — create a new record
          </button>
        )}
      </div>
    </div>
  )
}
