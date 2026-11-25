// Tìm khai báo CSS bị ghi đè hoàn toàn: cùng selector (y nguyên), cùng ngữ cảnh @media, cùng thuộc tính và cùng
// !important, và một luật SAU (theo thứ tự import trong global.css) khai báo lại → khai báo trước không bao giờ có tác dụng.
// Chạy: node scripts/css/shadowed.mjs [--remove]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const STYLES = join(ROOT, 'src/renderer/src')
const order = [...readFileSync(join(STYLES, 'global.css'), 'utf8').matchAll(/@import '\.\/(.+?)'/g)].map((m) => join(STYLES, m[1]))

const ctx = (node) => {
  const out = []
  for (let p = node.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'atrule') out.unshift(`@${p.name} ${p.params}`)
  return out.join(' ')
}
const norm = (sel) => sel.replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1').trim()

export function scan({ remove = false } = {}) {
  const roots = order.map((f) => ({ f, root: postcss.parse(readFileSync(f, 'utf8'), { from: f }) }))
  const last = new Map() // khoá → khai báo sau cùng
  const all = []
  for (const { root } of roots)
    root.walkDecls((d) => {
      const r = d.parent
      if (r.type !== 'rule' || /keyframes/i.test(r.parent?.name ?? '')) return
      // Mỗi selector trong danh sách là một khoá riêng; chỉ coi là bị ghi đè khi MỌI selector của luật đều bị ghi đè.
      const keys = r.selectors.map((s) => `${ctx(r)}|${norm(s)}|${d.prop}|${d.important}`)
      all.push({ d, keys })
      for (const k of keys) last.set(k, d)
    })
  const dead = all.filter(({ d, keys }) => keys.every((k) => last.get(k) !== d && last.get(k).parent !== d.parent))
  const report = dead.map(({ d }) => ({ file: d.source.input.file.slice(STYLES.length + 1), line: d.source.start.line, sel: d.parent.selector, decl: `${d.prop}:${d.value}` }))
  if (remove) {
    for (const { d } of dead) {
      const r = d.parent
      d.remove()
      if (!r.nodes.some((n) => n.type === 'decl')) r.remove()
    }
    for (const { f, root } of roots) writeFileSync(f, root.toString())
  }
  return report
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = scan({ remove: process.argv.includes('--remove') })
  for (const x of r) console.log(`${x.file}:${x.line}  ${x.sel.slice(0, 70)}  { ${x.decl.slice(0, 60)} }`)
  console.log(`${r.length} khai báo bị ghi đè hoàn toàn`)
}
