// Kiểm tra nhanh bản build trên Electron thật (Chromium của Electron, không phải jsdom như vitest):
//   1. Không có máy chủ  → màn khởi động phải hiện, phủ kín cửa sổ, báo "không tới được máy chủ".
//   2. Bật máy chủ giả   → bấm "Thử lại" → màn đăng nhập phải hiện, phủ kín cửa sổ.
// Bắt được lỗi kiểu "trắng màn hình" (CSS vỡ trên Chromium của Electron, từng gặp ở bản 31) mà test jsdom không thấy.
// Chạy: npm run smoke (build --mode eval rồi chạy file này). Trên Linux không có màn hình: xvfb-run -a npm run smoke.
// Không cần thư viện thêm: nói chuyện với cửa sổ qua Chrome DevTools Protocol (WebSocket có sẵn trong Node 22).
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'out', 'smoke')
// Cùng địa chỉ VITE_API_BASE_URL trong .env.eval.
const API_PORT = 8000
const STEP_TIMEOUT_MS = 20000
const MIN_COVER = 0.9 // phần cửa sổ mà màn khởi động / đăng nhập phải phủ

const electronBin = createRequire(import.meta.url)('electron') // gói electron trả về đường dẫn file chạy
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
let child
let api

function fail(msg) {
  console.error('\n✗ SMOKE FAIL: ' + msg)
  cleanup()
  process.exit(1)
}
function cleanup() {
  try {
    child?.kill('SIGKILL')
  } catch {
    /* đã tắt */
  }
  api?.close()
}

// Máy chủ giả: đủ để BootGate qua được GET /health và màn đăng nhập không báo lỗi.
function startFakeApi() {
  return new Promise((ok, bad) => {
    const srv = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
      res.setHeader('Access-Control-Allow-Headers', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
      if (req.method === 'OPTIONS') return res.writeHead(204).end()
      const path = req.url.split('?')[0]
      res.setHeader('Content-Type', 'application/json')
      if (path === '/health') return res.end(JSON.stringify({ status: 'ok', db: 'ok', ai: { ok: true } }))
      if (path === '/auth/client-config') return res.end('{}')
      res.writeHead(404).end('{"detail":"not found"}')
    })
    srv.once('error', (e) => bad(e.code === 'EADDRINUSE' ? new Error(`cổng ${API_PORT} đang bận (tắt máy chủ thật trước khi chạy smoke)`) : e))
    srv.listen(API_PORT, '127.0.0.1', () => ok(srv))
  })
}

async function waitFor(what, fn, timeout = STEP_TIMEOUT_MS) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try {
      last = await fn()
      if (last) return last
    } catch (e) {
      last = e
    }
    await sleep(250)
  }
  fail(`hết ${timeout / 1000}s vẫn chưa thấy ${what}` + (last instanceof Error ? ` (${last.message})` : ''))
}

// Mở Electron với cổng DevTools ngẫu nhiên; đọc địa chỉ từ stderr.
function launch() {
  const args = ['--remote-debugging-port=0', '.']
  if (process.platform === 'linux') args.unshift('--no-sandbox') // máy CI không có chrome-sandbox setuid
  child = spawn(electronBin, args, { cwd: ROOT, env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' } })
  child.on('exit', (code, sig) => child && fail(`Electron thoát sớm (code ${code}, signal ${sig})`))
  return new Promise((ok) => {
    let buf = ''
    child.stderr.on('data', (d) => {
      buf += d
      const m = buf.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//)
      if (m) ok(Number(m[1]))
    })
    child.stdout.on('data', () => {})
  })
}

class Cdp {
  constructor(url) {
    this.id = 0
    this.wait = new Map()
    this.errors = []
    this.ws = new WebSocket(url)
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.wait.has(msg.id)) {
        const { ok, bad } = this.wait.get(msg.id)
        this.wait.delete(msg.id)
        msg.error ? bad(new Error(msg.error.message)) : ok(msg.result)
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails
        this.errors.push(d.exception?.description || d.text)
      }
    }
    this.ready = new Promise((ok, bad) => {
      this.ws.onopen = ok
      this.ws.onerror = () => bad(new Error('không nối được DevTools'))
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((ok, bad) => this.wait.set(id, { ok, bad }))
  }
  async eval(fn, ...args) {
    const r = await this.send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT, name + '.png'), Buffer.from(data, 'base64'))
  }
}

// Chạy trong cửa sổ: phần tử `sel` có nội dung, phủ bao nhiêu cửa sổ, và điểm giữa cửa sổ có rơi vào nó không
// (rơi vào html/body/#root nghĩa là chỗ đó trống — đúng kiểu trắng màn hình).
function measure(sel, need) {
  const el = document.querySelector(sel)
  if (!el) return null
  const r = el.getBoundingClientRect()
  const vw = innerWidth
  const vh = innerHeight
  const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0))
  const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
  const hit = document.elementFromPoint(vw / 2, vh / 2)
  const body = el.innerText || ''
  return {
    cover: (w * h) / (vw * vh),
    centreInside: !!hit && el.contains(hit),
    centre: hit ? hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') + (hit.className ? '.' + String(hit.className).split(' ')[0] : '') : null,
    hasNeed: !need || !!el.querySelector(need),
    textLen: body.trim().length,
    bg: getComputedStyle(el).backgroundColor + ' ' + getComputedStyle(el).backgroundImage.slice(0, 40),
  }
}

async function expectScreen(cdp, label, sel, need) {
  await waitFor(`${label} (${sel}${need ? ' có ' + need : ''})`, async () => {
    const r = await cdp.eval(measure, sel, need)
    return r && r.hasNeed ? r : null
  })
  await sleep(600) // chờ hiệu ứng vào màn xong rồi mới đo / chụp
  const r = await cdp.eval(measure, sel, need)
  await cdp.shot(label)
  console.log(`  ${label}: phủ ${(r.cover * 100).toFixed(0)}% cửa sổ, giữa cửa sổ = ${r.centre}, ${r.textLen} ký tự`)
  if (r.cover < MIN_COVER) fail(`${label} chỉ phủ ${(r.cover * 100).toFixed(0)}% cửa sổ (cần ≥ ${MIN_COVER * 100}%) — nghi trắng màn hình. Xem out/smoke/${label}.png`)
  if (!r.centreInside) fail(`điểm giữa cửa sổ rơi vào ${r.centre}, không thuộc ${sel} — nghi trắng màn hình. Xem out/smoke/${label}.png`)
  if (r.textLen < 20) fail(`${label} gần như không có chữ (${r.textLen} ký tự)`)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  console.log(`Electron: ${electronBin}`)
  const guard = setTimeout(() => fail('Electron không mở cổng DevTools'), STEP_TIMEOUT_MS)
  const port = await launch()
  clearTimeout(guard)

  const target = await waitFor('cửa sổ app://medassist', async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    return list.find((t) => t.type === 'page' && t.url.startsWith('app://'))
  })
  const cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  const ver = await cdp.eval(() => navigator.userAgent.match(/Electron\/[\d.]+|Chrome\/[\d.]+/g).join(' '))
  console.log(`Cửa sổ: ${target.url} (${ver})`)

  // 1. Chưa có máy chủ: BootGate thử /health tối đa 4 giây rồi hiện thông báo lỗi + nút Thử lại.
  await expectScreen(cdp, '1-boot-no-server', '.boot', '.banner.d')

  // 2. Bật máy chủ giả, bấm "Thử lại" → vào màn đăng nhập.
  api = await startFakeApi()
  await cdp.eval(() => document.querySelector('.boot-acts .btn-primary').click())
  await expectScreen(cdp, '2-login', '.login', '.login-form')

  if (cdp.errors.length) fail('lỗi JavaScript trong cửa sổ:\n  ' + cdp.errors.join('\n  '))
  console.log(`\n✓ SMOKE OK — ảnh chụp ở out/smoke/`)
  const c = child
  child = null // thoát chủ động, không tính là "thoát sớm"
  c.kill()
  api.close()
  process.exit(0)
}

process.on('SIGINT', () => fail('bị ngắt'))
main().catch((e) => fail(e.stack || String(e)))
