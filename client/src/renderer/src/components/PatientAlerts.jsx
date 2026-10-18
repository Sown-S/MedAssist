import Icon from './Icon'
import { translate } from '../i18n'

// Nhắc nhở CHỈ ĐỌC về dị ứng thuốc và bệnh nền — hiện ngay khi mở hồ sơ / tiếp đón. Lễ tân không sửa ở đây.
export default function PatientAlerts({ p, compact = false }) {
  const allergies = p.allergies?.trim()
  const history = p.history?.trim()
  if (!allergies && !history) return compact ? null : <p className="pl-none">No recorded drug allergies or chronic conditions.</p>
  return (
    <div className={'pl-alerts' + (compact ? ' compact' : '')}>
      {allergies && (
        <div className="pl-alert danger">
          <Icon name="alert" />
          <span>
            <b>Drug allergy:</b> {translate(allergies)}
          </span>
        </div>
      )}
      {history && (
        <div className="pl-alert caution">
          <Icon name="help" />
          <span>
            <b>Chronic conditions:</b> {translate(history)}
          </span>
        </div>
      )}
    </div>
  )
}
