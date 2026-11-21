import { useEffect, useRef, useState } from 'react'
import { translate } from '../i18n'

// Ô ngày dùng chung: luôn hiện dd/mm/yyyy (ô ngày gốc của Windows hiện mm/dd/yyyy theo máy, lệch với giao diện tiếng Việt).
// value / onChange dùng chuỗi ISO yyyy-mm-dd như ô ngày gốc. Gõ tay được; nút lịch mở lịch chọn của hệ điều hành.
const toDmy = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '')
function toIso(dmy) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy.trim())
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

export default function DateField({ value = '', onChange, min, max, className = '', style, title, placeholder, id, disabled, ...rest }) {
  const [text, setText] = useState(toDmy(value))
  const picker = useRef(null)
  useEffect(() => setText(toDmy(value)), [value])
  function commit() {
    if (!text.trim()) return value && onChange('')
    const iso = toIso(text)
    if (!iso || (min && iso < min) || (max && iso > max)) return setText(toDmy(value))
    if (iso !== value) onChange(iso)
  }
  return (
    <span className={'datef' + (className ? ' ' + className : '')} style={style} title={title}>
      <input
        id={id}
        className="input"
        type="text"
        inputMode="numeric"
        placeholder={placeholder ?? translate('dd/mm/yyyy')}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit())}
        {...rest}
      />
      <button type="button" className="datef-cal" tabIndex={-1} disabled={disabled} title={translate('Choose from calendar')} onClick={() => picker.current?.showPicker?.()}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      <input ref={picker} type="date" className="datef-native" tabIndex={-1} aria-hidden="true" min={min} max={max} value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </span>
  )
}
