// JSX runtime của app (khai báo ở electron.vite.config.js → jsxImportSource: '@i18n').
// Giống hệt react/jsx-runtime, chỉ thêm bước dịch chuỗi theo ngôn ngữ đang chọn.
import { jsx as baseJsx, jsxs as baseJsxs, Fragment } from 'react/jsx-runtime'
// Không import './index' ở đây: Vite đóng gói sẵn (pre-bundle) file runtime này vào node_modules/.vite,
// nếu kéo theo vi.js thì bản dịch mới thêm sẽ không hiện khi chạy dev. index.js tự đăng ký hàm dịch
// lên globalThis.__medassistI18n, runtime chỉ việc gọi nó.
const localizeProps = (type, props) => globalThis.__medassistI18n?.localizeProps?.(type, props) ?? props

export { Fragment }
export const jsx = (type, props, key) => baseJsx(type, localizeProps(type, props), key)
export const jsxs = (type, props, key) => baseJsxs(type, localizeProps(type, props), key)
