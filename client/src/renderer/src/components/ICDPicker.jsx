import { useState } from 'react'
import { translate } from '../i18n'
import { ICD10 } from '../pages/admin/ai/catalog'
import { fold } from '../api/patientStore'
import { DEMO_MODE } from '../api/client'
import { useConditions } from '../api/conditionCatalog'

export default function ICDPicker({ value, onChange }) {
  const [openList, setOpenList] = useState(false)
  // Chạy với server: bệnh Active của bản tri thức (tên tiếng Việt, ICD-10); giả lập dùng danh sách mẫu.
  const live = useConditions(!DEMO_MODE)
  const source = DEMO_MODE ? ICD10 : live
  // Ô đang chứa đúng mục đã chọn thì hiện cả danh sách.
  const q = fold(value)
  const exact = source.some((o) => value.startsWith(o.code + ' — '))
  const options = (exact || !q ? source : source.filter((o) => fold(o.code + ' ' + o.label + ' ' + translate(o.label)).includes(q))).slice(0, 10)

  function pick(opt) {
    // Giá trị ô nhập là dữ liệu (không tự dịch khi hiển thị) nên dịch ngay lúc chọn.
    onChange(`${opt.code} — ${DEMO_MODE ? translate(opt.label) : opt.label}`)
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
          // onMouseDown chạy trước onBlur của ô nhập; dùng onClick thì danh sách đóng trước khi kịp chọn.
          <div className="icd-opt" key={opt.conditionCode ?? opt.code} onMouseDown={() => pick(opt)}>
            <b>{opt.code}</b> {opt.label}
          </div>
        ))}
      </div>
    </div>
  )
}
