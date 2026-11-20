import { useEffect, useState } from 'react'
import Icon from './Icon'
import { translate, getLang } from '../i18n'

const hello = (h) => (h < 11 ? 'Good morning' : h < 13 ? 'Good midday' : h < 18 ? 'Good afternoon' : 'Good evening')

// Đầu trang chủ: đường dẫn, lời chào theo giờ, nhãn ngày giờ (+ nhãn riêng của vai trò) và nút thao tác bên phải.
export default function HomeGreeting({ crumb, name, extra, children }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(t)
  }, [])
  const vi = getLang() === 'vi'
  const day = now.toLocaleDateString(vi ? 'vi-VN' : 'en-GB', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const h = now.getHours()
  return (
    <div className="ghead">
      <div className="greet">
        <div className="crumb2">
          {translate(crumb)}
          <span>›</span>
          <b>{translate('Home')}</b>
        </div>
        <h2>
          <span className="hi">{translate(hello(h))}</span>, <b>{name}</b>
        </h2>
        <div className="gmeta">
          <span className="gpill cap">
            <Icon name="calendar" />
            <span>{day}</span>
          </span>
          <span className="gpill">
            <Icon name="clock" />
            <span className="gclock">{time}</span>
          </span>
          {extra}
        </div>
      </div>
      {children && <div className="dash-acts">{children}</div>}
    </div>
  )
}
