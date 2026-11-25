// Sinh schema zod từ ảnh chụp OpenAPI (tests/contract/openapi.json) cho các response app đọc nhiều nhất.
// Chạy: node scripts/contract/gen_zod.mjs        (ghi src/renderer/src/api/schemas.gen.js)
//       node scripts/contract/gen_zod.mjs --check (báo lỗi nếu file sinh ra khác file đã commit — chạy trong test)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(ROOT, 'src/renderer/src/api/schemas.gen.js')
export const COMPONENTS = ['QueueItem', 'AwaitingPaymentItem', 'PrescriptionListItem', 'InvoiceHistoryItem', 'PatientOut', 'PatientSummary']

export function generate(openapi = JSON.parse(readFileSync(resolve(ROOT, 'tests/contract/openapi.json'), 'utf8'))) {
  const all = openapi.components.schemas
  const need = new Set()
  const visit = (name) => {
    if (need.has(name)) return
    need.add(name)
    JSON.stringify(all[name]).replace(/"#\/components\/schemas\/([^"]+)"/g, (_, n) => (visit(n), ''))
  }
  COMPONENTS.forEach(visit)
  // Khai báo phụ thuộc trước (thứ tự topo), z.lazy không cần vì các schema này không đệ quy.
  const order = []
  const seen = new Set()
  const topo = (name) => {
    if (seen.has(name)) return
    seen.add(name)
    JSON.stringify(all[name]).replace(/"#\/components\/schemas\/([^"]+)"/g, (_, n) => (topo(n), ''))
    order.push(name)
  }
  ;[...need].sort().forEach(topo)
  const lines = ['// FILE SINH TỰ ĐỘNG từ tests/contract/openapi.json — đừng sửa tay. Sinh lại: node scripts/contract/gen_zod.mjs', "import { z } from 'zod'", '']
  for (const name of order) lines.push(`export const ${name} = ${expr(all[name])}`, '')
  return lines.join('\n')
}

function expr(s) {
  if (s.$ref) return s.$ref.split('/').pop()
  if (s.anyOf) {
    let nonNull = s.anyOf.filter((x) => x.type !== 'null')
    // integer | number (Decimal của Pydantic) → một z.number().
    if (nonNull.length > 1 && nonNull.every((x) => x.type === 'integer' || x.type === 'number')) nonNull = [{ type: 'number' }]
    const base = nonNull.length === 1 ? expr(nonNull[0]) : `z.union([${nonNull.map(expr).join(', ')}])`
    return nonNull.length < s.anyOf.length ? `${base}.nullable()` : base
  }
  if (s.enum) return s.enum.length === 1 ? `z.literal(${JSON.stringify(s.enum[0])})` : `z.enum(${JSON.stringify(s.enum)})`
  if (s.const !== undefined) return `z.literal(${JSON.stringify(s.const)})`
  switch (s.type) {
    case 'string':
      return 'z.string()'
    case 'integer':
      return 'z.number().int()'
    case 'number':
      return 'z.number()'
    case 'boolean':
      return 'z.boolean()'
    case 'array':
      return `z.array(${s.items ? expr(s.items) : 'z.unknown()'})`
    case 'object': {
      if (!s.properties) return 'z.record(z.string(), z.unknown())'
      const req = new Set(s.required ?? [])
      const props = Object.keys(s.properties)
        .sort()
        .map((k) => {
          const p = s.properties[k]
          let e = expr(p)
          if (!req.has(k)) e += '.optional()'
          return `  ${/^[a-z_$][\w$]*$/i.test(k) ? k : JSON.stringify(k)}: ${e}`
        })
      // looseObject: server thêm trường mới không làm app báo lỗi.
      return `z.looseObject({\n${props.join(',\n')}\n})`
    }
    default:
      return 'z.unknown()'
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = generate()
  if (process.argv.includes('--check')) {
    if (readFileSync(OUT, 'utf8') !== code) {
      console.error('schemas.gen.js lệch openapi.json — chạy node scripts/contract/gen_zod.mjs')
      process.exit(1)
    }
  } else writeFileSync(OUT, code)
}
