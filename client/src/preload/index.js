import { contextBridge, ipcRenderer } from 'electron'

// Cầu nối an toàn giữa React và Electron: React gọi window.api.xxx(), KHÔNG truy cập Node.js trực tiếp.
//  - secureStore: lưu token đăng nhập đã mã hoá bằng safeStorage của hệ điều hành (TC03).
//  - config: cấu hình riêng của máy này (địa chỉ server...).
const api = {
  secureStore: {
    get: (key) => ipcRenderer.invoke('secure:get', key),
    set: (key, value) => ipcRenderer.invoke('secure:set', key, value),
    remove: (key) => ipcRenderer.invoke('secure:remove', key)
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (patch) => ipcRenderer.invoke('config:set', patch)
  }
}

contextBridge.exposeInMainWorld('api', api)
