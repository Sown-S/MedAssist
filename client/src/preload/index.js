import { contextBridge, ipcRenderer } from 'electron'

// Cầu nối duy nhất giữa giao diện và Electron (giao diện không truy cập Node.js trực tiếp).
// secureStore: token mã hoá bằng safeStorage của hệ điều hành; config: cấu hình riêng của máy này.
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
