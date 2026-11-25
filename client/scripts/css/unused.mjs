// Tìm luật CSS chết: selector có class không xuất hiện ở đâu trong mã nguồn renderer (JSX/JS/HTML).
// Chạy: node scripts/css/unused.mjs            (liệt kê)
//       node scripts/css/unused.mjs --remove   (xoá các selector chết; luật còn selector sống thì giữ phần sống)
// Class ghép động ('t-' + tone) được tính là sống nếu có chuỗi tiền tố 't-' trong mã. Thận trọng: chỉ xoá khi MỌI
// class lạ của selector đều không thấy — chạy lại bộ test giao diện (e2e visual) sau khi xoá.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = join(ROOT, 'src/renderer')
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
const files = walk(SRC)
const code = files.filter((f) => /\.(jsx?|html)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n')

const tokens = new Set(code.split(/[^\w-]+/))
const prefixes = [...code.matchAll(/['"`\s]([a-z][\w-]*-)['"`]\s*\+|([a-z][\w-]*-)\$\{/gi)].map((m) => m[1] ?? m[2])
// Class do thư viện tự gắn (biểu tượng lucide) hoặc do trình duyệt / Electron.
const EXTERNAL = [/^lucide/]
const live = (c) => tokens.has(c) || prefixes.some((p) => c.startsWith(p)) || EXTERNAL.some((r) => r.test(c))
// Class trong :not(...) không làm selector chết (class lạ trong :not luôn đúng) nên bỏ qua.
const classesOf = (sel) => [...sel.replace(/\[[^\]]*\]/g, '').replace(/:not\([^)]*\)/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])

export function scan({ remove = false } = {}) {
  const report = []
  for (const f of files.filter((x) => x.endsWith('.css'))) {
    const css = readFileSync(f, 'utf8')
    const root = postcss.parse(css)
    let changed = false
    root.walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return
      const sels = rule.selectors
      const dead = sels.filter((s) => classesOf(s).some((c) => !live(c)))
      if (!dead.length) return
      report.push({ file: relative(ROOT, f), line: rule.source.start.line, dead, all: dead.length === sels.length })
      if (!remove) return
      changed = true
      if (dead.length === sels.length) rule.remove()
      else rule.selectors = sels.filter((s) => !dead.includes(s))
    })
    if (remove && changed) {
      // Xoá @media / @supports rỗng sau khi bỏ luật.
      root.walkAtRules((a) => a.nodes && !a.nodes.length && a.remove())
      writeFileSync(f, root.toString())
    }
  }
  return report
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = scan({ remove: process.argv.includes('--remove') })
  for (const x of r) console.log(`${x.file}:${x.line}  ${x.all ? 'luật chết' : 'bỏ selector'}  ${x.dead.join(' , ').slice(0, 160)}`)
  console.log(`${r.length} luật có selector chết (${r.filter((x) => x.all).length} luật chết hẳn)`)
}
