import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'

// Khung nhắc CHỈ ĐỌC khi kê đơn (Proposal FR03, Architecture 5.1.6): dị ứng + bệnh nền + tình trạng mang thai,
// ghi rõ hệ thống không kiểm tra tương tác thuốc — bác sĩ tự đánh giá.
export function ReminderPanel({ visit }) {
  return (
    <div className="rx-reminder">
      <Icon name="alert" />
      <div>
        <b>Reminder (read-only)</b>
        <span>
          {translate('Drug allergies')}: {visit.allergies ? <b>{translate(visit.allergies)}</b> : translate('none recorded')} · {translate('Chronic conditions')}:{' '}
          {visit.history ? translate(visit.history) : translate('none recorded')}
          {visit.pregnancy === 'yes' ? ' · ' + translate('Pregnant') : ''}
        </span>
        <small>The system does not check drug interactions, doses or duplicate prescriptions — the doctor is responsible for reviewing the prescription.</small>
      </div>
    </div>
  )
}
