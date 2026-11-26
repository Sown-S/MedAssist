import Icon from '../../../components/Icon'
import { translate } from '../../../i18n'
import { askPregnancy, PREGNANCY_LABEL } from '../../../api/patient'

// Khung nhắc chỉ đọc khi kê đơn (FR03): dị ứng, bệnh nền, mang thai của lượt khám (nữ / khác 12–55 tuổi: đủ 3 trạng thái) —
// bác sĩ tự đánh giá tương tác thuốc.
export function ReminderPanel({ visit }) {
  return (
    <div className="reminder">
      <Icon name="bell" />
      <span>
        {translate('Drug allergies')}: {visit.allergies ? <b>{translate(visit.allergies)}</b> : translate('none recorded')} · {translate('Chronic conditions')}: {visit.history ? translate(visit.history) : translate('none recorded')}
        {askPregnancy(visit.gender, visit.age) && (
          <>
            {' · '}
            {visit.pregnancy === 'yes' ? <b>{translate(PREGNANCY_LABEL.yes)}</b> : translate(PREGNANCY_LABEL[visit.pregnancy ?? ''])}
          </>
        )}
        .{' '}
        <span className="muted">{translate('The system does not check drug interactions, doses or duplicate prescriptions — the doctor is responsible for reviewing the prescription.')}</span>
      </span>
    </div>
  )
}
