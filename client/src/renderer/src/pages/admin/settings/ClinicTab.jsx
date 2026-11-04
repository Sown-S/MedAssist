import Icon from '../../../components/Icon'
import { useToast } from '../../../context/ToastContext'
import { Field } from './Field'

// Tab “Phòng khám”: thông tin in trên đơn thuốc, hoá đơn, báo cáo. form = { fp, text, val, set } của SettingsPage.
export function ClinicTab({ form }) {
  const { fp, text, val, set } = form
  const { showToast } = useToast()

  function onLogo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(f.type)) return showToast('Choose a PNG, JPG, SVG or WebP image', 'error')
    if (f.size > 300 * 1024) return showToast('The logo must be smaller than 300 KB', 'error')
    const r = new FileReader()
    r.onload = () => set('clinic.logo', r.result)
    r.readAsDataURL(f)
  }

  return (
    <div className="card">
      <p className="ai-soft ai-small set-intro">Printed on prescriptions, invoices and reports.</p>
      <div className="set-grid">
        <Field {...fp('clinic.name')} wide>
          <input {...text('clinic.name')} placeholder="e.g. Phòng khám Đa khoa An Bình" />
        </Field>
        <Field {...fp('clinic.address')} wide>
          <input {...text('clinic.address')} />
        </Field>
        <Field {...fp('clinic.phone')}>
          <input {...text('clinic.phone', { inputMode: 'tel' })} />
        </Field>
        <Field {...fp('clinic.email')}>
          <input {...text('clinic.email', { type: 'email' })} />
        </Field>
        <Field {...fp('clinic.taxCode')}>
          <input {...text('clinic.taxCode', { inputMode: 'numeric' })} />
        </Field>
        <Field {...fp('clinic.licenseNo')}>
          <input {...text('clinic.licenseNo')} />
        </Field>
        <Field {...fp('clinic.licenseDate')}>
          <input {...text('clinic.licenseDate', { type: 'date' })} />
        </Field>
        <Field {...fp('clinic.licenseIssuer')}>
          <input {...text('clinic.licenseIssuer')} placeholder="e.g. Sở Y tế Đà Nẵng" />
        </Field>
        <Field {...fp('clinic.director')}>
          <input {...text('clinic.director')} />
        </Field>
        <Field {...fp('clinic.directorLicense')}>
          <input {...text('clinic.directorLicense')} />
        </Field>
        <Field {...fp('clinic.logo')} wide hint="PNG, JPG, SVG or WebP, under 300 KB.">
          <div className="set-logo">
            {val('clinic.logo') ? <img src={val('clinic.logo')} alt="" /> : <span className="ai-soft ai-small">No logo</span>}
            <label className="btn btn-ghost btn-sm">
              <Icon name="paperclip" /> <span>Choose image</span>
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={onLogo} />
            </label>
            {val('clinic.logo') && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('clinic.logo', '')}>
                Remove
              </button>
            )}
          </div>
        </Field>
      </div>
    </div>
  )
}
