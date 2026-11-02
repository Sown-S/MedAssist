// Nạp i18n trước tiên để hàm dịch sẵn sàng trước khi tạo bất kỳ JSX nào.
import './i18n'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import '@fontsource-variable/plus-jakarta-sans'
// Đóng gói font cùng app: máy không cài IBM Plex Mono sẽ hiện font có chân.
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/ibm-plex-mono/700.css'
import './global.css'
import { loadServerConfig } from './api/serverConfig'

// HashRouter vì bản build chạy từ app:// của Electron, không có server phục vụ các route như /doctor.
loadServerConfig().then(() =>
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  )
)
