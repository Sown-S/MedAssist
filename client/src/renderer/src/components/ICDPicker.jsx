import { useState } from 'react'
import { translate } from '../i18n'
import { fold } from '../api/patient'
import { useConditions } from '../api/conditionCatalog'

// onPick (tuỳ chọn): gọi khi chọn một mục trong danh sách; không có thì chọn cũng đi qua onChange.
export default function ICDPicker({ value, onChange, onPick = onChange }) {
  const [openList, setOpenList] = useState(false)
  // Bệnh Active của bản tri thức (tên tiếng Việt, ICD-10).
  const source = useConditions(true)
  // Ô đang chứa đúng mục đã chọn thì hiện cả danh sách.
  const q = fold(value)
  const exact = source.some((o) => value.startsWith(o.code + ' — '))
  const options = (exact || !q ? source : source.filter((o) => fold(o.code + ' ' + o.label + ' ' + translate(o.label)).includes(q))).slice(0, 10)

  function pick(opt) {
    onPick(`${opt.code} — ${opt.label}`)
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
