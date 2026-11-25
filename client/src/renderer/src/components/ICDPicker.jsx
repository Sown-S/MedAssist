import { useState } from 'react'
import Icon from './Icon'
import { translate } from '../i18n'
import { useConditions } from '../api/conditionCatalog'
import { fitsSex } from '../api/symptoms'
import { fold } from '../utils/format'

const SEX_NOTE = { Female: 'Usually only in women', Male: 'Usually only in men' }

// onPick (tuỳ chọn): gọi khi chọn một mục trong danh sách; không có thì chọn cũng đi qua onChange.
// gender: giới tính bệnh nhân — mặc định ẩn bệnh không hợp giới tính, có nút "Hiện tất cả"; chọn bệnh như vậy chỉ cảnh báo, không chặn.
export default function ICDPicker({ value, onChange, onPick = onChange, gender = '' }) {
  const [openList, setOpenList] = useState(false)
  const [showAll, setShowAll] = useState(false)
  // Bệnh Active của bản tri thức (tên tiếng Việt, ICD-10).
  const all = useConditions(true)
  const fitting = all.filter((o) => fitsSex(o, gender))
  const hiddenCount = all.length - fitting.length
  const source = showAll ? all : fitting
  // Ô đang chứa đúng mục đã chọn thì hiện cả danh sách.
  const q = fold(value)
  const exact = source.some((o) => value.startsWith(o.code + ' — '))
  const options = (exact || !q ? source : source.filter((o) => fold(o.code + ' ' + o.label + ' ' + translate(o.label)).includes(q))).slice(0, 10)
  // Bệnh đang chọn không hợp giới tính bệnh nhân → nhắc nhẹ.
  const picked = all.find((o) => value === `${o.code} — ${o.label}`)
  const mismatch = picked && !fitsSex(picked, gender) ? picked : null

  function pick(opt) {
    onPick(`${opt.code} — ${opt.label}`)
    setOpenList(false)
  }

  return (
    <div className="icd-picker">
      <input className="input"
        type="text"
        placeholder="Type a disease name or ICD-10 code to search (e.g. J03, tonsillitis...)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpenList(true)}
        onBlur={() => setTimeout(() => setOpenList(false), 150)}
      />
      <div className={'icd-list' + (openList && (options.length || hiddenCount) ? ' show' : '')}>
        {options.map((opt) => (
          // onMouseDown chạy trước onBlur của ô nhập; dùng onClick thì danh sách đóng trước khi kịp chọn.
          <div className="icd-opt" key={opt.conditionCode ?? opt.code} onMouseDown={() => pick(opt)}>
            <b>{opt.code}</b> {opt.label}
            {!fitsSex(opt, gender) && <span className="icd-sex">{translate(SEX_NOTE[opt.sex])}</span>}
          </div>
        ))}
        {hiddenCount > 0 && (
          <button type="button" className="icd-more" onMouseDown={(e) => (e.preventDefault(), setShowAll(!showAll))}>
            <Icon name={showAll ? 'eye-off' : 'eye'} />
            {showAll ? translate('Hide diseases that do not match the patient’s sex') : translate('Show all ({n} hidden — do not match the patient’s sex)').replace('{n}', hiddenCount)}
          </button>
        )}
      </div>
      {mismatch && (
        <p className="small text-warning icd-warn">
          <Icon name="triangle-alert" /> {translate(SEX_NOTE[mismatch.sex])} — {translate('check the patient’s sex or the diagnosis.')}
        </p>
      )}
    </div>
  )
}
