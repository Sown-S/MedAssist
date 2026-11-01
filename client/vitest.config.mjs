import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Bộ test của client (npm test). API được giả lập bằng vi.doMock trong từng test nên không cần bật server, không đụng
// dữ liệu thật. jsdom cung cấp localStorage, document như trong cửa sổ Electron.
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@i18n': resolve('src/renderer/src/i18n')
    }
  },
  // JSX dịch qua runtime của app (@i18n/jsx-runtime) giống electron.vite.config — test giao diện thấy đúng chữ như khi chạy thật.
  esbuild: { jsx: 'automatic', jsxImportSource: '@i18n' },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{js,jsx}'],
    setupFiles: ['tests/setup.js']
  }
})
