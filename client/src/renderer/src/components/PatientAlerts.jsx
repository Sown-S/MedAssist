import Icon from './Icon'
import { translate } from '../i18n'

// Chỉ đọc; lễ tân không sửa dị ứng / bệnh nền ở đây.
export default function PatientAlerts({ p, compact = false }) {
  const allergies = p.allergies?.trim()
  const history = p.history?.trim()
  if (!allergies && !history && compact) return null
  // Dạng gọn trong bảng (Hàng chờ…): một dòng đỏ "Dị ứng …" như bản mẫu.
  if (compact)
    return allergies ? (
      <span className="allergy d-flex">
        <Icon name="triangle-alert" />
        {translate('Allergy')} {translate(allergies)}
      </span>
    ) : null
  return (
    <div className="alerts">
      {allergies ? (
        <div className="a allergy">
          <Icon name="triangle-alert" />
          {translate('Drug allergy')}: {translate(allergies)}
        </div>
      ) : (
        <div className="a muted">{translate('Drug allergy')}: {translate('none recorded')}</div>
      )}
      <div className="a">
        <Icon name="heart-pulse" />
        <span>
          <b>{translate('Chronic conditions')}:</b> {history ? translate(history) : translate('none recorded')}
        </span>
      </div>
    </div>
  )
}
