// Kiểm tra code giao diện: `npm run lint` (CI chạy ở job "Client (lint + test)").
// Luật recommended ở mức 'error'; cảnh báo cũng làm lint thất bại (--max-warnings 0) để code không bẩn dần.
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['out/**', 'dist/**', 'node_modules/**'] },
  { rules: js.configs.recommended.rules },
  {
    files: ['src/renderer/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    settings: { react: { version: '18.3' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      // Chữ tiếng Việt / dấu nháy cong viết thẳng trong JSX là chủ ý (runtime dịch đọc nguyên chuỗi).
      'react/no-unescaped-entities': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }]
    }
  },
  {
    files: ['src/main/**/*.js', 'src/preload/**/*.js', '*.config.{js,mjs}', 'vitest.config.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } }
  },
  {
    // Script Node (vd scripts/smoke.mjs); hàm truyền vào cửa sổ Electron chạy trong trình duyệt nên cần cả globals.browser.
    files: ['scripts/**/*.mjs', 'e2e/**/*.mjs', 'playwright.config.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['tests/**/*.{js,jsx}'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, ...globals.node }, parserOptions: { ecmaFeatures: { jsx: true } } },
    // Test giao diện (.jsx) dùng component trong JSX và hook như code app.
    plugins: { react, 'react-hooks': reactHooks },
    rules: { 'react/jsx-uses-vars': 'error', ...reactHooks.configs.recommended.rules }
  }
]
