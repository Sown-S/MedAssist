// Nhật ký lỗi trên máy và nút "Lưu thông tin lỗi" (Cài đặt › Tài khoản).
import { test, expect, login } from './app.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('lỗi giao diện vào nhật ký; Lưu thông tin lỗi ghi file kèm phiên bản và nhật ký', async ({ app, page }) => {
  await login(page, 'nurse')
  const logFile = join(await app.evaluate(({ app }) => app.getPath('userData')), 'logs', 'medassist.log')
  await page.evaluate(() => setTimeout(() => { throw new Error('e2e-loi-thu Bearer abc.def') }, 0))
  await expect.poll(() => { try { return readFileSync(logFile, 'utf8') } catch { return '' } }).toContain('e2e-loi-thu')
  expect(readFileSync(logFile, 'utf8')).not.toContain('abc.def')

  const out = join(tmpdir(), `medassist-diag-${Date.now()}.txt`)
  await app.evaluate(({ dialog }, out) => (dialog.showSaveDialog = async () => ({ canceled: false, filePath: out })), out)
  await page.locator('.top button[aria-label="Cài đặt"]').click()
  const m = page.locator('.ov.show .modal')
  const tab = m.getByRole('tab', { name: /Tài khoản/ })
  if (await tab.isVisible().catch(() => false)) await tab.click()
  await m.getByRole('button', { name: 'Lưu thông tin lỗi' }).click()
  await expect.poll(() => { try { return readFileSync(out, 'utf8') } catch { return '' } }, { timeout: 5000 }).toContain('Phiên bản app')
  const text = readFileSync(out, 'utf8')
  expect(text).toContain('e2e-loi-thu')
  expect(text).toMatch(/Electron \d+/)
  await page.keyboard.press('Escape')
})
