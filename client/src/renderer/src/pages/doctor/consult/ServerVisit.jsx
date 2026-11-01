import { useEffect, useState } from 'react'
import { translate } from '../../../i18n'
import { getVisitDetail } from '../../../api/clinicApi'

// Hàng đợi chỉ có thông tin tóm tắt → tải sinh hiệu, triệu chứng, hồ sơ trước khi mở phiếu để phiếu khởi tạo đúng dữ liệu.
export function ServerVisit({ visit, children }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    getVisitDetail(visit.id, visit.patientId).then(setDetail, (e) => setError(e.message))
  }, [visit.id, visit.patientId])
  if (error) return <p className="ai-soft">{translate(error)}</p>
  if (!detail) return <p className="ai-soft">{translate('Loading the visit…')}</p>
  return children({ ...visit, ...detail })
}
