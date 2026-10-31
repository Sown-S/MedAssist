import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'
import * as espree from 'espree'
import { VI, PATTERNS } from '../src/renderer/src/i18n/vi.js'

// Kiểm tra bản dịch tiếng Việt (vi.js) bằng cách đọc mã nguồn giao diện:
//  - mọi chuỗi tiếng Anh hiển thị (chữ trong JSX, title / placeholder / aria-label, translate('…')) phải có bản dịch
//    — thiếu thì giao diện tiếng Việt hiện lẫn chữ tiếng Anh mà không ai báo;
//  - vi.js không có khoá trùng — khoá sau đè khoá trước, bản dịch đang thấy có thể không phải bản vừa sửa.
// Chuỗi dựng động (`${n} …`) dịch bằng PATTERNS; chuỗi trong biến / mảng dữ liệu không kiểm ở đây.
const SRC = resolve(__dirname, '../src/renderer/src')
const VI_FILE = join(SRC, 'i18n/vi.js')

// Chuỗi cố ý không dịch: tên riêng, mã, phím tắt, đơn vị, ví dụ nhập liệu đã viết bằng tiếng Việt.
const KEEP = new Set([
  'M',
  'MedAssist',
  'dd/mm/yyyy',
  '09xx xxx xxx',
  '0xx xxx xxx xxx',
  'FT26…',
  'https://192.168.1.10',
  'https://',
  'F1',
  'F2',
  'F3',
  'F3 / Ctrl+K',
  'Alt+D',
  'Alt+L',
  'Alt+N',
  'Alt+T',
  'Ctrl+Enter',
  'Ctrl+Shift+Enter',
  'GET /health',
  'J01CA04',
  'KB',
  'd',
  'v',
  '· v',
  'hash',
  '· prev'
])
// Chuỗi có dấu tiếng Việt hoặc placeholder "vd: …" (ví dụ nhập liệu) là đã viết sẵn bằng tiếng Việt.
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]|^vd: /i

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) name !== 'i18n' && sourceFiles(p, out)
    else if (/\.jsx?$/.test(name)) out.push(p)
  }
  return out
}

const parse = (file) => espree.parse(readFileSync(file, 'utf8'), { ecmaVersion: 2023, sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true })

function walk(node, fn) {
  if (!node || typeof node.type !== 'string') return
  fn(node)
  for (const key in node) {
    if (key === 'loc') continue
    const v = node[key]
    if (Array.isArray(v)) v.forEach((x) => walk(x, fn))
    else if (v && typeof v === 'object') walk(v, fn)
  }
}

const TEXT_PROPS = new Set(['title', 'placeholder', 'aria-label'])
const isString = (n) => n?.type === 'Literal' && typeof n.value === 'string'

// Các chuỗi hiển thị của một file: [{ text, line }]
function displayStrings(file) {
  const out = []
  walk(parse(file), (n) => {
    if (n.type === 'JSXText') out.push({ text: n.value, line: n.loc.start.line })
    else if (n.type === 'JSXAttribute' && TEXT_PROPS.has(n.name.name) && isString(n.value)) out.push({ text: n.value.value, line: n.loc.start.line })
    else if (n.type === 'CallExpression' && ['translate', 't'].includes(n.callee.name) && isString(n.arguments[0])) out.push({ text: n.arguments[0].value, line: n.loc.start.line })
  })
  // Runtime dịch bỏ khoảng trắng đầu / cuối; JSX gộp xuống dòng thành một dấu cách.
  return out.map((x) => ({ ...x, text: x.text.replace(/\s+/g, ' ').trim() }))
}

const translated = (s) => VI[s] !== undefined || PATTERNS.some(([re]) => re.test(s))

describe('Bản dịch tiếng Việt (vi.js)', () => {
  it('mọi chuỗi giao diện tiếng Anh đều có bản dịch', () => {
    const missing = []
    for (const file of sourceFiles(SRC))
      for (const { text, line } of displayStrings(file))
        if (/[A-Za-z]/.test(text) && !KEEP.has(text) && !VIETNAMESE.test(text) && !translated(text))
          missing.push(`${relative(SRC, file).replace(/\\/g, '/')}:${line}  ${text}`)
    expect(missing, 'Thêm bản dịch vào i18n/vi.js (hoặc vào KEEP nếu cố ý không dịch)').toEqual([])
  })

  it('vi.js không có khoá trùng', () => {
    const seen = new Map()
    const dup = []
    walk(parse(VI_FILE), (n) => {
      if (n.type !== 'VariableDeclarator' || n.id.name !== 'VI') return
      for (const p of n.init.properties) {
        const key = p.key.type === 'Literal' ? p.key.value : p.key.name
        if (seen.has(key)) dup.push(`${key} (dòng ${seen.get(key)} và ${p.loc.start.line})`)
        else seen.set(key, p.loc.start.line)
      }
    })
    expect(dup).toEqual([])
  })

  // Khoá là câu tiếng Anh nên một từ chỉ có MỘT bản dịch. Từ nhiều nghĩa chỉ được dùng ở đúng khu vực của nghĩa đó;
  // nơi khác dùng cụm rõ nghĩa hơn (VD cân nặng là "Body weight", dòng hoá đơn là "Line item").
  it('từ nhiều nghĩa chỉ dùng đúng khu vực', () => {
    const ONLY_IN = {
      Weight: ['pages/admin/ai/', 'pages/admin/knowledge/'], // "Trọng số" của luật AI
      Item: ['pages/admin/ai/'] // "Đối tượng" được đánh giá
    }
    const wrong = []
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, '/')
      for (const { text, line } of displayStrings(file))
        if (ONLY_IN[text] && !ONLY_IN[text].some((dir) => rel.startsWith(dir))) wrong.push(`${rel}:${line}  "${text}" → "${VI[text]}"`)
    }
    expect(wrong, 'Dùng cụm tiếng Anh rõ nghĩa hơn cho ngữ cảnh này').toEqual([])
  })
})
