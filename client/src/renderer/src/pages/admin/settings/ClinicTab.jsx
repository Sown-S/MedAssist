import Icon from '../../../components/Icon'
import { DobInput } from '../../../components/PatientFields'
import { useToast } from '../../../context/ToastContext'
import { Field } from './Field'

// Server nhận logo là data URL PNG / JPEG / WebP, cả chuỗi tối đa 300.000 ký tự → thu nhỏ ở máy này trước khi gửi.
const LOGO_MAX_SIDE = 300
const LOGO_MAX_CHARS = 300000

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}
// Vẽ lại lên canvas cạnh dài tối đa LOGO_MAX_SIDE; PNG giữ nền trong suốt, quá dài thì thử WebP. null = không vừa giới hạn.
async function shrinkLogo(file) {
  const src = await readDataUrl(file)
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = src
  })
  const w = img.naturalWidth || LOGO_MAX_SIDE
  const h = img.naturalHeight || LOGO_MAX_SIDE
  const k = Math.min(1, LOGO_MAX_SIDE / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * k))
  canvas.height = Math.max(1, Math.round(h * k))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  for (const url of [canvas.toDataURL('image/png'), canvas.toDataURL('image/webp', 0.9)])
    if (/^data:image\/(png|webp);base64,/.test(url) && url.length <= LOGO_MAX_CHARS) return url
  return null
}

// Tab “Phòng khám”: thông tin in trên đơn thuốc, hoá đơn, báo cáo; lưu trên server, dùng chung mọi máy.
// form = { fp, text, val, set } của SettingsPage; readOnly khi mất kết nối server.
export function ClinicTab({ form, readOnly }) {
  const { fp, text, val, set } = form
  const { showToast } = useToast()

  async function onLogo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(f.type)) return showToast('Choose a PNG, JPG, SVG or WebP image', 'error')
    if (f.size > 5 * 1024 * 1024) return showToast('The image must be smaller than 5 MB', 'error')
    let url
    try {
      url = await shrinkLogo(f)
    } catch {
      return showToast('Cannot read this image', 'error')
    }
    if (!url) return showToast('The logo is still too large after resizing — choose a simpler image', 'error')
    set('clinic.logo', url)
  }

  return (
    <div className="card">
      <p className="ai-soft ai-small set-intro">Printed on prescriptions, invoices and reports. Shared by every computer in the clinic.</p>
      <fieldset className="set-fieldset" disabled={readOnly}>
        <div className="set-grid">
          <Field {...fp('clinic.name')} wide>
            <input {...text('clinic.name', { maxLength: 200 })} placeholder="e.g. Phòng khám Đa khoa An Bình" />
          </Field>
          <Field {...fp('clinic.address')} wide>
            <input {...text('clinic.address', { maxLength: 255 })} />
          </Field>
          <Field {...fp('clinic.phone')}>
            <input {...text('clinic.phone', { inputMode: 'tel', maxLength: 20 })} />
          </Field>
          <Field {...fp('clinic.email')}>
            <input {...text('clinic.email', { type: 'email', maxLength: 100 })} />
          </Field>
          <Field {...fp('clinic.taxCode')}>
            <input {...text('clinic.taxCode', { inputMode: 'numeric', maxLength: 20 })} />
          </Field>
          <Field {...fp('clinic.licenseNo')}>
            <input {...text('clinic.licenseNo', { maxLength: 50 })} />
          </Field>
          <Field {...fp('clinic.licenseDate')}>
            <DobInput value={val('clinic.licenseDate') ?? ''} onChange={(v) => set('clinic.licenseDate', v)} />
          </Field>
          <Field {...fp('clinic.licenseIssuer')}>
            <input {...text('clinic.licenseIssuer', { maxLength: 200 })} placeholder="e.g. Sở Y tế Đà Nẵng" />
          </Field>
          <Field {...fp('clinic.director')}>
            <input {...text('clinic.director', { maxLength: 100 })} />
          </Field>
          <Field {...fp('clinic.directorLicense')}>
            <input {...text('clinic.directorLicense', { maxLength: 50 })} />
          </Field>
          <Field {...fp('clinic.logo')} wide hint="PNG, JPG, SVG or WebP — resized to 300 px on the longest side.">
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
      </fieldset>
    </div>
  )
}
