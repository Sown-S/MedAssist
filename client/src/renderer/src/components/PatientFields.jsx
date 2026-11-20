import { useRef, useState } from 'react'
import { useToast } from '../context/ToastContext'
import Icon from './Icon'
import * as clinic from '../api/clinicApi'
import { ageOf } from '../api/patient'
import { translate } from '../i18n'
import { ymd } from '../utils/format'

// Ô thông tin hành chính của bệnh nhân dùng ở màn tiếp đón: nhập mới, sửa, cảnh báo hồ sơ có thể trùng.
export const PHONE_RE = /^0\d{9}$/
export const DOB_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/
export const ID_RE = /^\d{12}$/

// Hiển thị dd/mm/yyyy cố định: ô date gốc của Chromium theo vùng của Windows (máy en-US thành mm/dd/yyyy).
// Nút lịch mở bảng chọn ngày gốc, không cho chọn ngày tương lai.
export function DobInput({ value, onChange, className = 'input' }) {
  const picker = useRef(null)
  return (
    <div className="dob-input">
      <input type="text" inputMode="numeric" placeholder="dd/mm/yyyy" className={className} value={value} onChange={(e) => onChange(clinic.maskDob(e.target.value))} />
      <button type="button" className="dob-cal" tabIndex={-1} title={translate('Choose from calendar')} onClick={() => picker.current?.showPicker()}>
        <Icon name="calendar" />
      </button>
      <input ref={picker} type="date" className="dob-native" tabIndex={-1} aria-hidden="true" min="1900-01-01" max={ymd()} value={clinic.isoDob(value) ?? ''} onChange={(e) => onChange(clinic.dmyDob(e.target.value))} />
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
      <div className="fg">
        <div className="field">
          <label>Full name *</label>
          <input className="input" type="text" {...bind('name')} />
        </div>
        <div className="field">
          <label>Date of birth *</label>
          <DobInput value={f.dob} onChange={(dob) => setF({ ...f, dob })} />
        </div>
        <div className="field">
          <label>Gender</label>
          <select className="input" {...bind('gender')}>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </select>
        </div>
        <div className="field">
          <label>Phone number *</label>
          <input className="input" type="text" {...bind('phone')} />
        </div>
        <div className="field">
          <label>ID card number (CCCD)</label>
          <input className="input" type="text" inputMode="numeric" {...bind('idNumber')} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button data-shortcut="save" className="btn btn-primary btn-sm" disabled={bad} onClick={save}>
          <Icon name="check" /> Save changes
        </button>
      </div>
    </div>
  )
}

// Bệnh nhân mới: họ tên, ngày sinh, giới, SĐT, CCCD, dị ứng, bệnh nền. err(k) = ô k sai và đã bấm lưu.
export function NewPatientFields({ form, field, err, onDob }) {
  const fcls = (k, extra = '') => 'field' + (extra ? ' ' + extra : '') + (err(k) ? ' invalid' : '')
  const msg = (text) => (
    <span className="msg">
      <Icon name="circle-alert" />
      {translate(text)}
    </span>
  )
  const req = <span className="req">*</span>
  return (
    <>
      <div className="sec-t">
        <Icon name="user" />
        <span>Patient details</span>
      </div>
      <div className="fg fg-3">
        <div className={fcls('name')}>
          <label>
            {translate('Full name')}
            {req}
          </label>
          <input type="text" placeholder="Nguyễn Văn A" className="input" autoFocus {...field('name')} />
          {msg('Required')}
        </div>
        <div className={fcls('dob')}>
          <label>
            {translate('Date of birth')}
            {req}
          </label>
          <DobInput className="input" value={form.dob} onChange={onDob} />
          {msg('Enter a valid date (dd/mm/yyyy)')}
        </div>
        <div className="field">
          <label>Gender</label>
          <select className="input" {...field('gender')}>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </select>
        </div>
        <div className={fcls('phone')}>
          <label>
            {translate('Phone number')}
            {req}
          </label>
          <input type="text" placeholder="09xx xxx xxx" className="input" {...field('phone')} />
          {msg('Invalid phone number (10 digits required)')}
        </div>
        <div className={fcls('idNumber')}>
          <label>ID card number (CCCD)</label>
          <input type="text" inputMode="numeric" placeholder="0xx xxx xxx xxx" className="input" {...field('idNumber')} />
          {msg('12 digits, or leave empty')}
        </div>
        <div className="field">
          <label>Drug allergies</label>
          <input className="input" type="text" placeholder="Penicillin…" {...field('allergies')} />
        </div>
        <div className="field full">
          <label>Medical history (chronic conditions)</label>
          <input className="input" type="text" placeholder="Hypertension, diabetes…" {...field('history')} />
        </div>
      </div>
    </>
  )
}

export function DuplicateBanner({ dupes, allowNew, onPick, onCreateNew }) {
  return (
    <div className="banner w">
      <Icon name="alert" />
      <div className="txt" style={{ flex: 1 }}>
        <b>This patient may already have a record</b>
        <span>Same phone number, or same name and date of birth. Use the existing record if it is the same person.</span>
        <div className="dupe-list">
          {dupes.map((d) => (
            <div className="dupe-row" key={d.id}>
              <span className="num">{d.id}</span>
              <b>{d.name}</b>
              <span>{d.dob}</span>
              <span className="num">{d.phone}</span>
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
