import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { setLang } from '../src/renderer/src/i18n/index.js'
import ClusterAlerts from '../src/renderer/src/components/ClusterAlerts.jsx'
import { validate } from '../src/renderer/src/pages/admin/settings/settingsForm.js'

// GET /reports/clusters khi mở Dashboard (Admin, bác sĩ); PUT /admin/settings/alerts.cluster ở tab Vận hành.
let handle
let calls
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const REPORT = {
  window_days: 7, min_cases: 5, ratio: 2.0, period_from: '2026-11-04', period_to: '2026-11-10', baseline_from: '2026-10-07',
  alerts: [
    { kind: 'diagnosis', code: 'J11', name: 'Cúm mùa', cases: 6, baseline_avg: 1.25 },
    { kind: 'symptom', code: 'fever_high', name: 'Sốt cao', cases: 9, baseline_avg: 3 }
  ]
}

beforeEach(() => {
  localStorage.clear()
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname
      calls.push({ path, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined })
      const r = await handle(path, init)
      if (!r) throw new TypeError('Failed to fetch')
      return json(...r)
    })
  )
})
afterEach(() => {
  cleanup()
  setLang('en')
  vi.unstubAllGlobals()
})

describe('Banner cảnh báo cụm ca', () => {
  it('mỗi cảnh báo một dòng, phân biệt chẩn đoán / triệu chứng', async () => {
    handle = (path) => (path === '/api/v1/reports/clusters' ? [200, REPORT] : null)
    render(<ClusterAlerts />)
    expect(await screen.findByText('Diagnosis Cúm mùa: 6 cases in 7 days (previous periods averaged 1.25)')).toBeTruthy()
    expect(screen.getByText('Symptom Sốt cao: 9 cases in 7 days (previous periods averaged 3)')).toBeTruthy()
    expect(document.querySelectorAll('.cluster-alerts button')).toHaveLength(0)
  })

  it('tiếng Việt: dấu phẩy thập phân, đổi chữ Chẩn đoán / Triệu chứng', async () => {
    setLang('vi')
    handle = (path) => (path === '/api/v1/reports/clusters' ? [200, REPORT] : null)
    render(<ClusterAlerts />)
    expect(await screen.findByText('Chẩn đoán Cúm mùa: 6 ca trong 7 ngày (trung bình các kỳ trước 1,25)')).toBeTruthy()
    expect(screen.getByText('Triệu chứng Sốt cao: 9 ca trong 7 ngày (trung bình các kỳ trước 3)')).toBeTruthy()
  })

  it('không có cảnh báo, 403 hay mất kết nối → không hiện gì', async () => {
    for (const reply of [() => [200, { ...REPORT, alerts: [] }], () => [403, { error: { code: 'FORBIDDEN' } }], () => null]) {
      handle = reply
      const { container, unmount } = render(<ClusterAlerts />)
      await new Promise((ok) => setTimeout(ok, 0))
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })
})

describe('Cài đặt alerts.cluster', () => {
  it('kiểm giới hạn từng ô', async () => {
    const { getSettings } = await import('../src/renderer/src/api/settingsStore.js')
    const base = { ...getSettings(), clinic: { ...getSettings().clinic, name: 'PK' } }
    const errs = (ops) => validate({ ...base, ops: { ...base.ops, ...ops } })
    expect(errs({})).toEqual({})
    expect(errs({ clusterDays: 31 })).toHaveProperty(['ops.clusterDays'])
    expect(errs({ clusterDays: 2.5 })).toHaveProperty(['ops.clusterDays'])
    expect(errs({ clusterMinCases: 1 })).toHaveProperty(['ops.clusterMinCases'])
    expect(errs({ clusterRatio: 1.5 })).toEqual({})
    expect(errs({ clusterRatio: 11 })).toHaveProperty(['ops.clusterRatio'])
  })

  it('đọc từ server và lưu bằng PUT với số ngày / số ca là số nguyên', async () => {
    handle = (path, init) => {
      if (path === '/api/v1/admin/settings') return [200, [{ setting_key: 'alerts.cluster', value: { window_days: 14, min_cases: 8, ratio: 3 } }]]
      if (path === '/api/v1/admin/settings/alerts.cluster' && init.method === 'PUT') return [200, {}]
      return null
    }
    vi.resetModules()
    const s = await import('../src/renderer/src/api/settingsStore.js')
    await s.loadServerSettings()
    expect(s.getSettings().ops).toMatchObject({ clusterDays: 14, clusterMinCases: 8, clusterRatio: 3 })
    const draft = { ...s.getSettings(), ops: { ...s.getSettings().ops, clusterDays: 10, clusterRatio: 2.5 } }
    expect(await s.saveServerSettings(draft)).toEqual({ ok: true })
    const put = calls.find((c) => c.method === 'PUT')
    expect(put.path).toBe('/api/v1/admin/settings/alerts.cluster')
    expect(put.body).toEqual({ value: { window_days: 10, min_cases: 8, ratio: 2.5 } })
  })
})
