// So hai file dấu vân tay (fingerprint.spec.mjs): in các phần tử có kiểu hiển thị khác nhau.
import { readFileSync } from 'node:fs'
// --no-size: bỏ qua width/height (đổi theo dữ liệu trên màn hình giữa hai lần chạy).
const args = process.argv.slice(2)
const skip = args.includes('--no-size') ? new Set([2, 3]) : new Set()
const [a, b] = args.filter((x) => !x.startsWith('--')).map((f) => JSON.parse(readFileSync(f, 'utf8')))
const same = (s, t) => s === t || s.split('|').every((v, i) => skip.has(i) || v === t.split('|')[i])
let diffs = 0
for (const view of Object.keys(a)) {
  if (!b[view]) continue
  for (const [el, s] of Object.entries(a[view])) {
    if (!(el in b[view]) || same(s, b[view][el])) continue
    diffs++
    if (diffs <= 40) {
      const x = s.split('|'), y = b[view][el].split('|')
      console.log(view, el.slice(-120), x.map((v, i) => (v !== y[i] && !skip.has(i) ? `${i}: ${v} → ${y[i]}` : null)).filter(Boolean).join('; '))
    }
  }
}
console.log(`${diffs} phần tử khác kiểu`)
process.exit(diffs ? 1 : 0)
