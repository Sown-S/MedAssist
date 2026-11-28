// Biến CSS: dùng var(--x) mà không nơi nào khai báo (gõ nhầm tên token) và khai báo mà không nơi nào dùng (token chết).
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/renderer')
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))

export function scan() {
  const all = walk(SRC)
    .filter((f) => /\.(css|jsx?|html)$/.test(f))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')
  // Khai báo trong CSS (--x:) hoặc từ JS (style={{ '--x': … }}, setProperty('--x', …)).
  const defs = new Set([...all.matchAll(/(--[\w-]+)\s*:/g), ...all.matchAll(/['"`](--[\w-]+)['"`]/g)].map((m) => m[1]))
  const uses = [...all.matchAll(/var\((--[\w-]+)\s*([,)])/g)]
  const used = new Set(uses.map((m) => m[1]))
  return {
    // var(--x, fallback) có giá trị dự phòng nên không tính là lỗi.
    undefined: [...new Set(uses.filter((m) => m[2] === ')' && !defs.has(m[1])).map((m) => m[1]))],
    unused: [...defs].filter((d) => !used.has(d) && !all.includes(`'${d}'`) && !all.includes(`"${d}"`))
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(scan())
