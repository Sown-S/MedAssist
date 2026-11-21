import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'

// Khung nhắc chỉ đọc khi kê đơn (FR03): dị ứng, bệnh nền, mang thai — bác sĩ tự đánh giá tương tác thuốc.
export function ReminderPanel({ visit }) {
  return (
    <div className="reminder">
      <Icon name="bell" />
      <span>
        {translate('Drug allergies')}: {visit.allergies ? <b>{translate(visit.allergies)}</b> : translate('none recorded')} · {translate('Chronic conditions')}: {visit.history ? translate(visit.history) : translate('none recorded')}
        {visit.pregnancy === 'yes' ? ' · ' + translate('Pregnant') : ''}.{' '}
        <span className="muted">{translate('The system does not check drug interactions, doses or duplicate prescriptions — the doctor is responsible for reviewing the prescription.')}</span>
      </span>
    </div>
  )
}
