// JSX runtime của app (jsxImportSource: '@i18n'): như react/jsx-runtime, thêm bước dịch chuỗi.
import { jsx as baseJsx, jsxs as baseJsxs, Fragment } from 'react/jsx-runtime'
// Không import './index': Vite đóng gói sẵn file này, kéo theo vi.js thì bản dịch mới sẽ không hiện khi chạy dev.
// index.js tự đăng ký hàm dịch lên globalThis.
const localizeProps = (type, props) => globalThis.__medassistI18n?.localizeProps?.(type, props) ?? props

export { Fragment }
export const jsx = (type, props, key) => baseJsx(type, localizeProps(type, props), key)
export const jsxs = (type, props, key) => baseJsxs(type, localizeProps(type, props), key)
