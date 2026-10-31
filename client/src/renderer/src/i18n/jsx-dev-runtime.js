// Bản dev của jsx-runtime.js.
import { jsxDEV as baseJsxDEV, Fragment } from 'react/jsx-dev-runtime'
// Không import './index': Vite đóng gói sẵn file này, kéo theo vi.js thì bản dịch mới sẽ không hiện khi chạy dev.
// index.js tự đăng ký hàm dịch lên globalThis.
const localizeProps = (type, props) => globalThis.__medassistI18n?.localizeProps?.(type, props) ?? props

export { Fragment }
export const jsxDEV = (type, props, ...rest) => baseJsxDEV(type, localizeProps(type, props), ...rest)
