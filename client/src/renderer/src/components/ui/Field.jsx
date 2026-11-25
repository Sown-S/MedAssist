import { Children, cloneElement, useId } from 'react'
import styles from './Field.module.css'

// Ô nhập có nhãn: tự nối <label htmlFor>, aria-invalid và aria-describedby (gợi ý + lỗi) vào ô con duy nhất,
// để trình đọc màn hình đọc được lỗi. error: chuỗi lỗi (tiếng Anh, tự dịch) hoặc object lỗi của react-hook-form.
export default function Field({ label, hint, error, full = false, className = '', children }) {
  const auto = useId()
  const child = Children.only(children)
  const id = child.props.id ?? auto
  const msg = typeof error === 'string' ? error : error?.message
  const describedBy = [hint && `${id}-hint`, msg && `${id}-err`].filter(Boolean).join(' ') || undefined
  return (
    <div className={['field', full && 'full', msg && styles.invalid, className].filter(Boolean).join(' ')}>
      {label && <label htmlFor={id}>{label}</label>}
      {cloneElement(child, { id, 'aria-invalid': msg ? true : undefined, 'aria-describedby': describedBy })}
      {hint && (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {msg && (
        <span className={styles.err} id={`${id}-err`} role="alert">
          {msg}
        </span>
      )}
    </div>
  )
}
