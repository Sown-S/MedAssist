import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// CSP trong index.html chặn script inline; riêng lúc dev, plugin React chèn một đoạn script inline (React Refresh)
// nên chỉ khi chạy dev mới nới script-src.
const devInlineScripts = {
  name: 'dev-inline-scripts',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
}

// electron-vite build 3 phần độc lập: main (tiến trình chính Electron),
// preload (cầu nối an toàn giữa main <-> renderer), renderer (chính là app React của mình).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        // JSX runtime riêng để dịch chuỗi giao diện Anh/Việt — xem src/renderer/src/i18n.
        '@i18n': resolve('src/renderer/src/i18n')
      }
    },
    plugins: [react({ jsxImportSource: '@i18n' }), devInlineScripts],
    // Không cho Vite đóng gói sẵn runtime dịch: bản đóng gói sẵn được trình duyệt cache vĩnh viễn (immutable)
    // theo mã ?v=..., mã này có thể trùng giữa các lần đóng gói → Electron dùng mãi bản runtime CŨ
    // (kèm bảng vi.js cũ) và chuỗi mới thêm không được dịch. Phục vụ thẳng từ mã nguồn thì luôn là bản mới.
    optimizeDeps: {
      include: ['react/jsx-runtime', 'react/jsx-dev-runtime'],
      exclude: ['@i18n/jsx-runtime', '@i18n/jsx-dev-runtime']
    }
  }
})
