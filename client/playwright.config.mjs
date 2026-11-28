// Test đầu cuối chạy trên Electron thật với máy chủ thật (npm run e2e). Cần:
//   1. Máy chủ ở http://127.0.0.1:8000 với dữ liệu kiểm thử (server/scripts/seed_eval.py, mật khẩu E2E_PASSWORD).
//   2. Bản build eval: npm run build:eval (npm run e2e tự build).
// Trên Linux không có màn hình: xvfb-run -a npm run e2e. CI chạy job "Client e2e" trong .github/workflows/ci.yml.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' } },
  fullyParallel: false,
  workers: 1, // một cửa sổ Electron, một CSDL dùng chung
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'out/e2e-report' }]] : 'list',
  outputDir: 'out/e2e-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}'
})
