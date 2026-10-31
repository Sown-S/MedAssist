import { useState } from 'react'
import { translate } from '../i18n'
import { ICD10 } from '../pages/admin/ai/catalog'
import { fold } from '../api/patientStore'

export default function ICDPicker({ value, onChange }) {
  const [openList, setOpenList] = useState(false)
  // Ô đang chứa đúng mục đã chọn thì hiện cả danh sách.
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
          // onMouseDown chạy trước onBlur của ô nhập; dùng onClick thì danh sách đóng trước khi kịp chọn.
          <div className="icd-opt" key={opt.code} onMouseDown={() => pick(opt)}>
            <b>{opt.code}</b> {opt.label}
          </div>
        ))}
      </div>
    </div>
  )
}
