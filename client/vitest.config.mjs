import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Bộ test nghiệp vụ của client (npm test). Chạy ở chế độ giả lập (VITE_USE_MOCK=true) dù client/.env đang trỏ server thật:
// test không cần bật server, không đụng dữ liệu thật. jsdom cung cấp localStorage, document như trong cửa sổ Electron.
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@i18n': resolve('src/renderer/src/i18n')
    }
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    env: { VITE_USE_MOCK: 'true' },
    setupFiles: ['tests/setup.js']
  }
})
