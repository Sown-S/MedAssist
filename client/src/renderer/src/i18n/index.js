import { VI, PATTERNS } from './vi'

// Mã nguồn viết chuỗi giao diện bằng tiếng Anh; khi chọn tiếng Việt, chuỗi được dịch ngay lúc tạo phần tử JSX
// (jsx-runtime.js), nên trang không phải gọi translate() ở từng chỗ. Bản dịch nằm trong vi.js.
const KEY = 'medassist_lang'
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'vi', name: 'Tiếng Việt' }
]

function readSaved() {
  try {
    return localStorage.getItem(KEY) === 'vi' ? 'vi' : 'en'
  } catch {
    return 'en'
  }
}

// Trạng thái đặt trên globalThis để jsx-runtime (được Vite đóng gói riêng khi chạy dev) dùng chung với module này.
const store = (globalThis.__medassistI18n ??= { lang: readSaved(), listeners: new Set(), rev: 0 })
document.documentElement.lang = store.lang
// Hai đường dịch (JSX và translate) luôn đọc cùng một bảng — tránh việc sau cập nhật nóng mỗi đường giữ một bản vi.js.
store.tables = { VI, PATTERNS }
store.rev ??= 0

export function getLang() {
  return store.lang
}
export function setLang(next) {
  if (next === store.lang) return
  store.lang = next
  try {
    localStorage.setItem(KEY, next)
  } catch {/* không lưu được thì chỉ áp dụng cho phiên này */}
  document.documentElement.lang = next
  store.listeners.forEach((fn) => fn())
}
export function getRenderKey() {
  return store.lang + ':' + store.rev
}
export function subscribe(fn) {
  store.listeners.add(fn)
  return () => store.listeners.delete(fn)
}

export function translate(s) {
  if (store.lang === 'en') return s
  const [, lead, core, tail] = s.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!/[A-Za-z]/.test(core)) return s
  const { VI, PATTERNS } = store.tables
  let out = VI[core]
  if (out === undefined) {
    const hit = PATTERNS.find(([re]) => re.test(core))
    if (!hit) return s
    out = core.replace(hit[0], hit[1])
  }
  return lead + out + tail
}

const TEXT_PROPS = ['placeholder', 'title', 'aria-label', 'defaultValue']

// Không dịch `value` của ô nhập — đó là dữ liệu người dùng gõ.
export function localizeProps(type, props) {
  if (store.lang === 'en' || typeof type !== 'string' || !props) return props
  let out = null
  const set = (k, v) => {
    out ??= { ...props }
    out[k] = v
  }
  const c = props.children
  if (typeof c === 'string') {
    const t = translate(c)
    if (t !== c) set('children', t)
  } else if (Array.isArray(c)) {
    let arr = null
    c.forEach((x, i) => {
      if (typeof x !== 'string') return
      const t = translate(x)
      if (t !== x) (arr ??= c.slice())[i] = t
    })
    if (arr) set('children', arr)
  }
  for (const k of TEXT_PROPS) {
    if (typeof props[k] === 'string') {
      const t = translate(props[k])
      if (t !== props[k]) set(k, t)
    }
  }
  if (props.readOnly && typeof props.value === 'string') {
    const t = translate(props.value)
    if (t !== props.value) set('value', t)
  }
  return out ?? props
}

store.localizeProps = localizeProps

// Sửa vi.js khi chạy dev → nạp bảng dịch mới và dựng lại tại chỗ, không mất phiên đăng nhập.
if (import.meta.hot) {
  import.meta.hot.accept('./vi', (m) => {
    if (!m) return
    store.tables = { VI: m.VI, PATTERNS: m.PATTERNS }
    store.rev++
    store.listeners.forEach((fn) => fn())
  })
}
