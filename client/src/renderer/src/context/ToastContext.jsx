import { createContext, useCallback, useContext, useRef, useState } from 'react'
import Icon from '../components/Icon'

const ToastContext = createContext(null)
const ICON = { success: 'circle-check', error: 'circle-x', warning: 'triangle-alert' }

// Thông báo nhanh góc trên phải, xếp chồng như bản mẫu (.toasts > .toast): hiện 2,8 giây rồi trượt ra.
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const seq = useRef(0)

  // kind: 'ok' (mặc định) | 'error' | 'warning'
  const showToast = useCallback((msg, k = 'ok') => {
    const id = ++seq.current
    const type = k === 'error' ? 'error' : k === 'warning' ? 'warning' : 'success'
    setItems((list) => [...list, { id, msg, type }])
    setTimeout(() => {
      setItems((list) => list.map((t) => (t.id === id ? { ...t, out: true } : t)))
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 220)
    }, 2800)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={'toast ' + t.type + (t.out ? ' out' : '')} role={t.type === 'error' ? 'alert' : 'status'}>
            <Icon name={ICON[t.type]} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
