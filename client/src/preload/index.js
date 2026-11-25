import { contextBridge, ipcRenderer, webFrame } from 'electron'

// Cầu nối duy nhất giữa giao diện và Electron (giao diện không truy cập Node.js trực tiếp).
// secureStore: token mã hoá bằng safeStorage của hệ điều hành; config: cấu hình riêng của máy này;
// updates: bản mới trên GitHub (main process gọi, chỉ thông báo) và mở trang Releases; log: nhật ký lỗi;
// view: thu phóng giao diện.
const api = {
  secureStore: {
    get: (key) => ipcRenderer.invoke('secure:get', key),
    set: (key, value) => ipcRenderer.invoke('secure:set', key, value),
    remove: (key) => ipcRenderer.invoke('secure:remove', key)
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (patch) => ipcRenderer.invoke('config:set', patch)
  },
  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    openReleases: () => ipcRenderer.invoke('update:open'),
    // Mọi bản phát hành (cài lại bản trước).
    openAllReleases: () => ipcRenderer.invoke('update:open', 'all')
  },
  // Nhật ký lỗi trên máy: ghi lỗi giao diện; xuất file thông tin lỗi để gửi nhóm phát triển.
  log: {
    write: (level, message, extra) => ipcRenderer.invoke('log:write', level, message, extra),
    exportFile: () => ipcRenderer.invoke('log:export')
  },
  // Thu phóng toàn bộ giao diện (Cài đặt › Cỡ chữ): phóng cả chữ, khoảng cách, icon cùng tỉ lệ.
  view: {
    setZoom: (factor) => webFrame.setZoomFactor(factor),
    getZoom: () => webFrame.getZoomFactor()
  }
}

contextBridge.exposeInMainWorld('api', api)
