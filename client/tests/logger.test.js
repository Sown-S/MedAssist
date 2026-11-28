import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger, redact, diagnosticsText } from '../src/main/logger.js'
import { reportError } from '../src/renderer/src/lib/errorReport.js'

let dir
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'medassist-log-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('Nhật ký lỗi trên máy', () => {
  it('mỗi dòng một JSON, cắt thông điệp quá dài', () => {
    const log = createLogger(dir, { now: () => new Date('2026-11-25T08:00:00Z') })
    log.write('error', 'x'.repeat(3000), { stack: 'at a', context: { page: '#/doctor' }, source: 'renderer' })
    const e = JSON.parse(readFileSync(join(dir, 'medassist.log'), 'utf8'))
    expect(e).toMatchObject({ t: '2026-11-25T08:00:00.000Z', level: 'error', stack: 'at a', context: '{"page":"#/doctor"}', source: 'renderer' })
    expect(e.message.length).toBe(2001)
  })
  it('xoay vòng khi file vượt giới hạn, giữ đúng số file cũ, đọc lại cũ nhất trước', () => {
    const log = createLogger(dir, { maxBytes: 200, keep: 2 })
    for (let i = 0; i < 20; i++) log.write('info', `dòng ${i} ` + 'y'.repeat(60))
    expect(readdirSync(dir).sort()).toEqual(['medassist.1.log', 'medassist.2.log', 'medassist.log'])
    const lines = log.read().trim().split('\n').map((l) => JSON.parse(l).message)
    expect(lines.at(-1)).toMatch(/^dòng 19/)
    expect(lines.map((m) => Number(m.split(' ')[1]))).toEqual([...lines.map((m) => Number(m.split(' ')[1]))].sort((a, b) => a - b))
  })
  it('che token và mật khẩu', () => {
    expect(redact('Authorization: Bearer eyJhbGciOi.abc.def')).toBe('Authorization: Bearer ***')
    expect(redact('{"username":"bs01","password":"Kiemthu@2026"}')).toBe('{"username":"bs01","password":***}')
    expect(redact('refresh_token=abc123&x=1')).toBe('refresh_token=***&x=1')
  })
  it('file thông tin lỗi có phiên bản, môi trường và nhật ký', () => {
    const t = diagnosticsText({ app: '0.2.6', versions: { electron: '45', chrome: '142', node: '22' }, platform: 'win32 10.0', serverUrl: 'https://pk.local', logs: '{"m":1}\n', now: new Date('2026-11-25T08:00:00Z') })
    expect(t).toContain('Phiên bản app: 0.2.6')
    expect(t).toContain('Máy chủ: https://pk.local')
    expect(t.endsWith('{"m":1}\n')).toBe(true)
  })
  it('renderer gửi lỗi qua window.api.log (không có preload thì bỏ qua)', () => {
    expect(() => reportError(new Error('a'))).not.toThrow()
    const write = vi.fn()
    window.api = { log: { write } }
    reportError(new Error('Không đọc được'), { page: '#/x' })
    expect(write).toHaveBeenCalledWith('error', 'Không đọc được', expect.objectContaining({ context: { page: '#/x' } }))
    delete window.api
  })
})
