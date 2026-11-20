import { useEffect, useState } from 'react'
import Icon from './Icon'
import { apiGet } from '../api/client'
import { getLang, translate } from '../i18n'

// Cảnh báo cụm ca (GET /reports/clusters): chỉ Admin và bác sĩ được gọi (điều dưỡng nhận 403 nên không dùng ở Tiếp đón).
// Gọi một lần khi mở Trang chủ, hiện thành popup cạnh chuông. Không có cảnh báo, lỗi hay mất kết nối → không hiện gì.
// Đóng popup thì ẩn tới khi danh sách cảnh báo đổi (lưu trong phiên).
const SEEN_KEY = 'medassist_cluster_seen'
const SHOWN = 2 // dòng hiện sẵn; còn lại bấm "Xem tất cả"

export const clusterLine = (a, windowDays) => {
  const avg = Number(a.baseline_avg).toLocaleString(getLang() === 'vi' ? 'vi-VN' : 'en-GB', { maximumFractionDigits: 2 })
  const kind = a.kind === 'symptom' ? 'Symptom' : 'Diagnosis'
  return translate(`${kind} ${a.name || a.code}: ${a.cases} cases in ${windowDays} days (previous periods averaged ${avg})`)
}

const signature = (r) => r.period_to + ':' + r.alerts.map((a) => a.kind + a.code + a.cases).join(',')

export default function ClusterAlerts({ onOpenReport }) {
  const [report, setReport] = useState(null)
  const [seen, setSeen] = useState(() => sessionStorage.getItem(SEEN_KEY))
  const [all, setAll] = useState(false)
  useEffect(() => {
    let alive = true
    apiGet('/api/v1/reports/clusters').then(
      (r) => alive && setReport(r),
      () => {}
    )
    return () => {
      alive = false
    }
  }, [])
  const alerts = report?.alerts ?? []
  if (!alerts.length || seen === signature(report)) return null
  const close = () => {
    sessionStorage.setItem(SEEN_KEY, signature(report))
    setSeen(signature(report))
  }
  return (
    // Mức độ màu của popup: đỏ = cấp cứu, vàng = vấn đề cần xử lý (thuốc hết hạn, tồn thấp), xanh = thông tin thường.
    // Cụm ca là thông tin xu hướng (không cần làm gì ngay) → xanh.
    <div className="bell-pop info cluster-pop" role="status">
      <div className="ico p">
        <Icon name="trending-up" />
      </div>
      <div className="bp-t">
        <b>
          {translate('Case cluster alert')} · {alerts.length}
        </b>
        <div className="cluster-alerts">
          {(all ? alerts : alerts.slice(0, SHOWN)).map((a) => (
            <span key={a.kind + ':' + a.code}>{clusterLine(a, report.window_days)}</span>
          ))}
        </div>
        {alerts.length > SHOWN && (
          <span className="bp-acts mb-8">
            <button type="button" className="cl-more" onClick={() => setAll(!all)}>
              {all ? translate('Show less') : translate('Show all') + ' (' + alerts.length + ')'}
            </button>
          </span>
        )}
        {onOpenReport && (
          <span className="bp-acts">
            <button className="btn btn-outline btn-sm" onClick={onOpenReport}>
              <span>Open reports</span>
            </button>
          </span>
        )}
      </div>
      <button className="btn btn-ghost btn-icon" onClick={close} title={translate('Close')} aria-label={translate('Close')}>
        <Icon name="x" />
      </button>
    </div>
  )
}
