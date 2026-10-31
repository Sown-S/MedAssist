// Kiểm tra code giao diện: `npm run lint` (CI chạy ở job "Client (lint + test)").
// Giai đoạn đầu mọi luật chỉ CẢNH BÁO để không chặn PR; sửa dần từng nhóm rồi nâng lên 'error'.
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

// Hạ mọi luật đang 'error' xuống 'warn' (giữ nguyên tuỳ chọn của luật).
const asWarnings = (rules) =>
  Object.fromEntries(
    Object.entries(rules).map(([name, v]) => {
      const level = Array.isArray(v) ? v[0] : v
      if (level !== 'error' && level !== 2) return [name, v]
      return [name, Array.isArray(v) ? ['warn', ...v.slice(1)] : 'warn']
    })
  )

export default [
  { ignores: ['out/**', 'dist/**', 'node_modules/**'] },
  { rules: asWarnings(js.configs.recommended.rules) },
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
      ...asWarnings({ ...react.configs.recommended.rules, ...react.configs['jsx-runtime'].rules, ...reactHooks.configs.recommended.rules }),
      'react/prop-types': 'off',
      // Chữ tiếng Việt / dấu nháy cong viết thẳng trong JSX là chủ ý (runtime dịch đọc nguyên chuỗi).
      'react/no-unescaped-entities': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }]
    }
  },
  {
    files: ['src/main/**/*.js', 'src/preload/**/*.js', '*.config.{js,mjs}', 'vitest.config.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, ...globals.node } }
  }
]
