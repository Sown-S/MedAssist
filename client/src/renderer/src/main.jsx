// Nạp i18n trước tiên để hàm dịch sẵn sàng trước khi bất kỳ JSX nào được tạo.
import './i18n'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import '@fontsource-variable/plus-jakarta-sans'
// Font cho số và mã: đóng gói cùng app, máy không cài IBM Plex Mono sẽ hiện font có chân (Times).
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/ibm-plex-mono/700.css'
import './global.css'
import { loadServerConfig } from './api/serverConfig'

// Dùng HashRouter (không phải BrowserRouter): bản build chạy từ app://medassist (giao thức riêng của Electron),
// không có server phục vụ các route như /doctor, /admin.
// Nạp địa chỉ server của máy này trước khi dựng giao diện.
loadServerConfig().then(() =>
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  )
)
