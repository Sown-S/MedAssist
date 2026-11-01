import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('')
  const [kind, setKind] = useState('ok')
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)

  // kind: 'ok' (mặc định) | 'error' — báo lỗi hiện dấu "!" đỏ thay cho dấu ✓.
  const showToast = useCallback((msg, k = 'ok') => {
    setMessage(msg)
    setKind(k)
    setVisible(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 2600)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={'toast' + (kind === 'error' ? ' error' : '') + (visible ? ' show' : '')} role={kind === 'error' ? 'alert' : 'status'}>
        <span className="ic">{kind === 'error' ? '!' : '✓'}</span>
        <span className="msg">{message}</span>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
