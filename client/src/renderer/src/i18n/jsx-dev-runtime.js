// Bản dev của jsx-runtime.js (Vite dùng jsxDEV khi chạy "npm run dev").
import { jsxDEV as baseJsxDEV, Fragment } from 'react/jsx-dev-runtime'
// Không import './index' ở đây: Vite đóng gói sẵn (pre-bundle) file runtime này vào node_modules/.vite,
// nếu kéo theo vi.js thì bản dịch mới thêm sẽ không hiện khi chạy dev. index.js tự đăng ký hàm dịch
// lên globalThis.__medassistI18n, runtime chỉ việc gọi nó.
const localizeProps = (type, props) => globalThis.__medassistI18n?.localizeProps?.(type, props) ?? props

export { Fragment }
export const jsxDEV = (type, props, ...rest) => baseJsxDEV(type, localizeProps(type, props), ...rest)
