import { translate } from '../i18n'
import { useQueue, isMine, inRoom, atLabs, isPendingFlag } from '../api/queueStore'
import { useInventory, stockOf } from '../api/inventoryStore'
import { hhmm } from '../utils/format'

// Thông báo của chuông, tính tại máy từ hàng chờ và kho (không có API thông báo riêng).
// live: việc cần làm ngay theo vai trò — chấm đỏ trên chuông còn bật tới khi xử lý xong.
// all: live + cảnh báo thuốc sắp hết / hết hàng.
export default function useNotifications(user) {
  const { redFlags, visits, stale = [] } = useQueue()
  const inv = useInventory()
  const doctor = user.roleKey === 'doctor'
  const consult = (id) => '/doctor?view=consult' + (id ? '&visit=' + id : '')

  let live = []
  if (doctor) {
    live = [
      ...redFlags
        .filter((r) => isPendingFlag(r) && !r.doctorReview)
        .map((r) => ({ id: r.id, icon: 'siren', title: translate('Red-flag case') + ' — ' + r.name, note: translate(r.signs) || '—', time: hhmm(r.at), urgent: true, to: '/doctor' })),
      ...visits
        .filter((v) => inRoom(v) && v.returnNote && isMine(v, user))
        .map((v) => ({
          id: 'rt' + v.id,
          icon: 'fileText',
          title: translate('Prescription sent back') + ' — ' + v.name,
          note: v.returnNote.text || translate('not enough stock, please change these drugs'),
          time: hhmm(v.returnNote.at),
          urgent: true,
          to: consult(v.id)
        })),
      ...visits
        .filter((v) => atLabs(v) && v.labReturnedAt && isMine(v, user))
        .map((v) => ({ id: 'lb' + v.id, icon: 'flask', title: translate('Back from lab') + ' — ' + v.name, note: translate('Results are ready — resume the visit'), time: hhmm(v.labReturnedAt), to: consult() }))
    ]
  } else if (user.roleKey === 'reception') {
    // Lễ tân: lượt tồn từ ngày trước và ca cờ đỏ chưa hướng dẫn xong.
    live = [
      ...(stale.length
        ? [
            {
              id: 'stale',
              icon: 'history',
              title: stale.length + ' ' + translate('open visits from previous days'),
              note: translate('Close them with a reason, or collect payment if the patient came back.'),
              time: '',
              urgent: true,
              to: '/reception?stale=1'
            }
          ]
        : []),
      ...redFlags
        .filter((r) => isPendingFlag(r) && !r.ack)
        .map((r) => ({ id: r.id, icon: 'siren', title: translate('Red-flag case') + ' — ' + r.name, note: translate(r.signs) || '—', time: hhmm(r.at), urgent: true, to: '/reception?view=queue' }))
    ]
  }

  const low = inv.drugs.filter((d) => d.active && d.kind === 'drug' && stockOf(d, inv.batches).statuses.some((x) => x === 'out' || x === 'low'))
  const stock = low.length
    ? [
        {
          id: 'stock',
          title: low.length + ' ' + translate('drugs low or out of stock'),
          note: low
            .slice(0, 4)
            .map((d) => d.name)
            .join(', ') + (low.length > 4 ? '…' : ''),
          time: '',
          to: doctor ? '/doctor?view=drugs' : null
        }
      ]
    : []
  return { live, all: [...live, ...stock] }
}
