import Icon from './Icon'
import { ST, statusLabel } from '../api/queueStore'
import { translate } from '../i18n'
import { fmtDate } from '../utils/format'

// Bệnh nhân còn một lượt chưa kết thúc: lượt đang chờ hôm nay → mở lại ngay trong form; lượt đã vào khám → báo đang ở bước nào;
// lượt từ ngày trước → hướng dẫn đóng ở thông báo "lượt chưa đóng".
export default function OpenVisitBanner({ v, onOpen, onClose }) {
  const canOpen = v.today && v.status === ST.WAITING
  const where = !v.today ? translate('from a previous day') + (v.date ? ' (' + fmtDate(v.date) + ')' : '') : translate(statusLabel(v.status ?? ''))
  return (
    <div className="banner w" role="alert">
      <Icon name="alert" />
      <div className="txt grow">
        <b>{translate('This patient already has a visit that is not finished')}</b>
        <span>
          {v.ticket ? translate('No.') + ' ' + v.ticket + ' · ' : ''}
          {where}.{' '}
          {canOpen
            ? translate('Open that visit to continue the check-in instead of creating a new one?')
            : v.today
              ? translate('A new visit cannot be created until this one is finished.')
              : translate('Close it under “open visits from previous days” in the notifications, then check the patient in again.')}
        </span>
        <div className="d-flex gap-8 mt-8">
          {canOpen && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onOpen}>
              <Icon name="door-open" /> {translate('Open that visit')}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {translate('Close')}
          </button>
        </div>
      </div>
    </div>
  )
}
