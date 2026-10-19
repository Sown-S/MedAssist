import { createContext, useCallback, useContext, useRef, useState } from 'react'

// Bản HTML cũ dùng 1 hàm toàn cục showToast(msg) gọi ở bất kỳ đâu.
// Trong React, cách làm đúng là dùng Context: bọc App trong <ToastProvider>,
// rồi ở bất kỳ component con nào chỉ cần const { showToast } = useToast().
const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)

  const showToast = useCallback((msg) => {
    setMessage(msg)
    setVisible(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 2600)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={'toast-demo' + (visible ? ' show' : '')}>
        <span className="ic">✓</span>
        <span className="msg">{message}</span>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
