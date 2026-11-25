import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Cùng alias và runtime JSX dịch Anh/Việt như electron.vite.config.js để component hiện đúng như trong app.
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@i18n': resolve('src/renderer/src/i18n')
    }
  },
  // Ladle tự gắn plugin React; chỉ cần chỉ runtime JSX của app.
  esbuild: { jsx: 'automatic', jsxImportSource: '@i18n' },
  optimizeDeps: { exclude: ['@i18n/jsx-runtime', '@i18n/jsx-dev-runtime'] }
})
