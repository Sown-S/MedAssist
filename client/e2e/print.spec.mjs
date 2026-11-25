// Ảnh so sánh các mẫu in: mở file HTML do tests/print-templates.test.js sinh ra (dữ liệu cố định) trong một cửa sổ
// Electron riêng đúng bề ngang khổ giấy, nạp phông Be Vietnam Pro như app, chụp toàn trang.
// Đổi mẫu in có chủ ý: npx vitest run tests/print-templates.test.js -u rồi npm run e2e:update.
import { test, expect } from './app.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FONT = (w) => pathToFileURL(join(ROOT, `node_modules/@fontsource/be-vietnam-pro/${w}.css`)).href
// Bề ngang vùng in (px ở 96 dpi): 80 mm trừ lề 3 mm hai bên; A5 148 mm trừ lề 12 mm.
const SAMPLES = [
  ['ticket', 280],
  ['receipt', 280],
  ['prescription', 468],
  ['lab-order', 468]
]

for (const [name, width] of SAMPLES)
  test(`mẫu in ${name}`, async ({ app }) => {
    const file = join(ROOT, 'tests/__print__', `${name}.html`)
    const [win] = await Promise.all([
      app.waitForEvent('window'),
      app.evaluate(({ BrowserWindow }, { file, width }) => {
        const w = new BrowserWindow({ width, height: 900, useContentSize: true, show: true, webPreferences: { sandbox: true } })
        w.loadFile(file)
      }, { file, width })
    ])
    await win.waitForLoadState('load')
    for (const w of [400, 600, 700]) await win.addStyleTag({ url: FONT(w) })
    await win.evaluate(() => document.fonts.ready)
    await expect(win).toHaveScreenshot(`${name}.png`, { fullPage: true, maxDiffPixelRatio: 0.02 })
    await win.close()
  })
