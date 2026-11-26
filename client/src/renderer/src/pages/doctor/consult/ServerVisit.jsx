import { useEffect, useState } from 'react'
import { translate } from '../../../i18n'
import { getVisitDetail, pregnancyOf } from '../../../api/clinicApi'

// Hàng đợi chỉ có thông tin tóm tắt → tải sinh hiệu, triệu chứng, hồ sơ trước khi mở phiếu để phiếu khởi tạo đúng dữ liệu.
// update(v): phiếu vừa lưu lượt khám lên máy chủ (sinh hiệu, mang thai) → gộp bản trả về để phiếu hiện đúng dữ liệu đã lưu.
export function ServerVisit({ visit, children }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    getVisitDetail(visit.id, visit.patientId).then(setDetail, (e) => setError(e.message))
  }, [visit.id, visit.patientId])
  if (error) return <p className="muted">{translate(error)}</p>
  if (!detail) return <p className="muted">{translate('Loading the visit…')}</p>
  const update = (v) => setDetail((x) => ({ ...x, vitals: v.vital_signs ?? {}, serverVitals: v.vital_signs ?? {}, pregnancy: pregnancyOf(v) }))
  return children({ ...visit, ...detail }, update)
}
