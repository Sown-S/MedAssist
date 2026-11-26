import { useState } from 'react'
import Button from '../../../components/Button'
import Icon from '../../../components/Icon'
import PregnancyField from '../../../components/PregnancyField'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { updateVisit } from '../../../api/clinicApi'
import { askPregnancy } from '../../../api/patient'

// Bác sĩ sửa tình trạng mang thai của lượt đang khám (nữ / khác 12–55 tuổi). Mang thai ghi theo lượt khám:
// lưu xong thì đầu phiếu và khung nhắc kê đơn đổi theo bản máy chủ trả về.
export function PregnancyEditor({ visit, onVisitSaved }) {
  const { showToast } = useToast()
  const [value, setValue] = useState(null)
  if (!askPregnancy(visit.gender, visit.age)) return null
  async function save() {
    try {
      onVisitSaved?.(await updateVisit(visit.id, { pregnancy: value }))
      setValue(null)
      showToast('Pregnancy status saved for this visit')
    } catch (e) {
      showToast(translate(e.message), 'error')
      return false
    }
  }
  if (value === null)
    return (
      <button className="btn btn-ghost btn-sm clin-edit-btn" onClick={() => setValue(visit.pregnancy ?? '')}>
        <Icon name="baby" /> Edit pregnancy status
      </button>
    )
  return (
    <div className="clin-edit">
      <PregnancyField value={value} onChange={setValue} />
      <div className="d-flex gap-8 justify-end">
        <button className="btn btn-ghost btn-sm" onClick={() => setValue(null)}>
          Cancel
        </button>
        <Button className="btn btn-primary btn-sm" disabled={value === (visit.pregnancy ?? '')} onClick={save}>
          <Icon name="check" /> Save
        </Button>
      </div>
    </div>
  )
}
