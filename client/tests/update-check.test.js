import { describe, it, expect, vi } from 'vitest'
import { parseVersion, isNewer, fetchLatestRelease, LATEST_RELEASE_API } from '../src/main/updateCheck.js'

const reply = (status, body) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('updateCheck', () => {
  it('đọc tag có hoặc không có chữ v; tag lạ (rc) bỏ qua', () => {
    expect(parseVersion('v0.2.4')).toEqual([0, 2, 4])
    expect(parseVersion('0.10.0')).toEqual([0, 10, 0])
    expect(parseVersion('v0.3.0-rc1')).toBeNull()
  })

  it('so theo số, không so chuỗi', () => {
    expect(isNewer('v0.10.0', '0.9.9')).toBe(true)
    expect(isNewer('v0.2.4', '0.2.4')).toBe(false)
    expect(isNewer('v0.2.3', '0.2.4')).toBe(false)
  })

  it('GitHub có bản mới hơn → trả version, gọi đúng API', async () => {
    const f = reply(200, { tag_name: 'v0.2.5' })
    expect(await fetchLatestRelease(f, '0.2.4')).toEqual({ version: '0.2.5' })
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0][0]).toBe(LATEST_RELEASE_API)
  })

  it('bằng hoặc cũ hơn, hết lượt gọi (403), mất mạng → null, không ném lỗi', async () => {
    expect(await fetchLatestRelease(reply(200, { tag_name: 'v0.2.4' }), '0.2.4')).toBeNull()
    expect(await fetchLatestRelease(reply(403, { message: 'rate limit' }), '0.2.4')).toBeNull()
    expect(await fetchLatestRelease(vi.fn(async () => Promise.reject(new TypeError('offline'))), '0.2.4')).toBeNull()
  })
})
