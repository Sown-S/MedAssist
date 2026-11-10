import { useEffect, useState } from 'react'
import Icon from './Icon'
import { apiGet } from '../api/client'
import { getLang, translate } from '../i18n'

// Cảnh báo cụm ca (GET /reports/clusters): chỉ Admin và bác sĩ được gọi (điều dưỡng nhận 403 nên không dùng ở Tiếp đón).
// Gọi một lần khi mở Dashboard. Không có cảnh báo, lỗi hay mất kết nối → không hiện gì. Chỉ thông báo, không có nút.
export const clusterLine = (a, windowDays) => {
  const avg = Number(a.baseline_avg).toLocaleString(getLang() === 'vi' ? 'vi-VN' : 'en-GB', { maximumFractionDigits: 2 })
  const kind = a.kind === 'symptom' ? 'Symptom' : 'Diagnosis'
  return translate(`${kind} ${a.name || a.code}: ${a.cases} cases in ${windowDays} days (previous periods averaged ${avg})`)
}

export default function ClusterAlerts() {
  const [report, setReport] = useState(null)
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
  if (!alerts.length) return null
  return (
    <div className="warn-banner show caution cluster-alerts" role="status">
      <div className="icon">
        <Icon name="alert" />
      </div>
      <div className="txt">
        {alerts.map((a) => (
          <span key={a.kind + ':' + a.code}>{clusterLine(a, report.window_days)}</span>
        ))}
      </div>
    </div>
  )
}
