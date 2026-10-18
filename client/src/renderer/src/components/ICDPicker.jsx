import { useState } from 'react'
import { translate } from '../i18n'
import { ICD10 } from '../pages/admin/ai/catalog'
import { fold } from '../api/patientStore'

// Ghi chú traceability cho NFR/rủi ro trong đề cương: khi ghép API thật, mã ICD chọn ở đây
// nên được lưu kèm rule_id/version của gợi ý AI đã sinh ra chẩn đoán ban đầu (mục 13, bảng rủi ro).
export default function ICDPicker({ value, onChange }) {
  const [openList, setOpenList] = useState(false)
  // Lọc theo mã hoặc tên bệnh (cả tiếng Anh lẫn tiếng Việt); ô đang chứa đúng mục đã chọn thì hiện cả danh sách.
  const q = fold(value)
  const exact = ICD10.some((o) => value.startsWith(o.code + ' — '))
  const options = (exact || !q ? ICD10 : ICD10.filter((o) => fold(o.code + ' ' + o.label + ' ' + translate(o.label)).includes(q))).slice(0, 10)

  function pick(opt) {
    // Giá trị ô nhập là dữ liệu (không tự dịch khi hiển thị) nên dịch ngay lúc chọn.
    onChange(`${opt.code} — ${translate(opt.label)}`)
    setOpenList(false)
  }

  return (
    <div className="icd-picker">
      <input
        type="text"
        placeholder="Type a disease name or ICD-10 code to search (e.g. J03, tonsillitis...)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpenList(true)}
        onBlur={() => setTimeout(() => setOpenList(false), 150)}
      />
      <div className={'icd-list' + (openList && options.length ? ' show' : '')}>
        {options.map((opt) => (
          // onMouseDown thay vì onClick: chạy trước sự kiện onBlur của input ở trên,
          // nếu dùng onClick thì input mất focus và đóng danh sách trước khi kịp chọn.
          <div className="icd-opt" key={opt.code} onMouseDown={() => pick(opt)}>
            <b>{opt.code}</b> {opt.label}
          </div>
        ))}
      </div>
    </div>
  )
}
