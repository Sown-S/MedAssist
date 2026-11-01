import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Phiếu server → phiếu client, và màn danh mục Quản trị gửi đúng body cho API (ERD v2.1).
const ORDER = {
  order_id: 'o1',
  visit_id: 'v1',
  ordered_at: '2026-10-31T09:00:00+07:00',
  ordered_by: 'u1',
  ordered_by_name: 'BS Trần Minh',
  package_id: 'p1',
  package_name: 'Khám tổng quát cơ bản',
  package_price: 350000,
  diagnosis: 'Viêm họng?',
  note: 'Nhịn ăn',
  conclusion: 'Bạch cầu tăng',
  items: [
    { item_id: 'i1', service_id: 's1', item_name: 'Công thức máu', quantity: 1, unit_price: 90000, in_package: true, status: 'Ordered', result: '12 G/L', unit: 'G/L', ref_low: 4, ref_high: 10, ref_text: null, sample: 'blood' },
    { item_id: 'i2', service_id: 's2', item_name: 'Siêu âm ổ bụng', quantity: 1, unit_price: 150000, in_package: false, status: 'Cancelled', result: null, cancel_reason: 'Không làm' },
    { item_id: 'i3', service_id: null, item_name: 'Nội soi tai mũi họng', quantity: 1, unit_price: null, in_package: false, status: 'Ordered', result: null }
  ]
}

describe('Phiếu chỉ định từ server → phiếu client', () => {
  let store
  let queue
  beforeEach(async () => {
    vi.resetModules()
    store = await import('../src/renderer/src/api/serviceStore.js')
    queue = await import('../src/renderer/src/api/queueStore.js')
  })

  it('giữ người chỉ định, chẩn đoán sơ bộ, ghi chú, kết luận và tên gói', () => {
    expect(store.toLabOrder(ORDER)).toMatchObject({ id: 'o1', by: 'BS Trần Minh', diagnosis: 'Viêm họng?', note: 'Nhịn ăn', conclusion: 'Bạch cầu tăng', packageName: 'Khám tổng quát cơ bản' })
  })

  it('mỗi dòng có khoá kết quả "<order_id>:<item_id>", kết quả và khoảng tham chiếu', () => {
    const rows = queue.labRows(store.toLabOrder(ORDER))
    expect(rows.map((r) => r.key)).toEqual(['o1:i1', 'o1:i2', 'o1:i3'])
    expect(rows[0]).toMatchObject({ itemId: 'i1', result: '12 G/L', ref: '4–10 G/L', cancelled: false })
  })

  it('dòng đã huỷ được đánh dấu, không tính là chưa có kết quả', () => {
    expect(queue.labRows(store.toLabOrder(ORDER))[1].cancelled).toBe(true)
  })

  it('tóm tắt phiếu: tên gói + dòng ngoài gói còn hiệu lực (bỏ dòng đã huỷ)', () => {
    expect(queue.labOrderSummary(store.toLabOrder(ORDER))).toBe('Khám tổng quát cơ bản, Nội soi tai mũi họng')
  })

  it('chỉ định được: mọi xét nghiệm + dịch vụ không phải "khám bệnh", bỏ dịch vụ ngừng dùng', () => {
    const list = store.orderable([
      { kind: 'Lab', group_key: 'hematology', is_active: true, code: 'XN01' },
      { kind: 'Service', group_key: 'diagnostic', is_active: true, code: 'DV13' },
      { kind: 'Service', group_key: 'consult', is_active: true, code: 'DV01' },
      { kind: 'Service', group_key: 'procedure', is_active: false, code: 'DV03' }
    ])
    expect(list.map((s) => s.code)).toEqual(['XN01', 'DV13'])
  })
})

describe('Danh mục Dịch vụ / Xét nghiệm / Gói khám trên server', () => {
  let api
  let live
  beforeEach(async () => {
    vi.resetModules()
    api = {
      fetchServices: vi.fn(async () => [
        { service_id: 's1', code: 'DV01', name: 'Khám bệnh', kind: 'Service', group_key: 'consult', unit: 'lần', price: 80000, is_active: true },
        { service_id: 's2', code: 'XN01', name: 'Công thức máu', kind: 'Lab', group_key: 'hematology', unit: 'G/L', price: 90000, ref_low: 4, ref_high: 10, sample: 'blood', is_active: true }
      ]),
      fetchPackages: vi.fn(async () => [{ package_id: 'p1', code: 'GK01', name: 'Gói 1', price: 150000, is_active: true, items: [{ service_id: 's2', code: 'XN01', name: 'Công thức máu', kind: 'Lab', quantity: 1 }] }]),
      createService: vi.fn(async () => ({})),
      updateService: vi.fn(async () => ({})),
      createPackage: vi.fn(async () => ({})),
      updatePackage: vi.fn(async () => ({})),
      fetchPriceHistory: vi.fn(async () => [])
    }
    vi.doMock('../src/renderer/src/api/serviceApi.js', () => api)
    live = await import('../src/renderer/src/api/serviceCatalogLive.js')
    await live.reloadLiveCatalog()
  })
  afterEach(() => {
    vi.doUnmock('../src/renderer/src/api/serviceApi.js')
  })

  it('thêm xét nghiệm: gửi mã, loại Lab, nhóm, giá và khoảng tham chiếu', async () => {
    const r = await live.saveLiveRow('labs', { code: 'XN99', name: 'CRP', group: 'immunology', unit: 'mg/L', price: 60000, low: 0, high: 5, refText: '', sample: 'blood' })
    expect(r.ok).toBe(true)
    expect(api.createService).toHaveBeenCalledWith(expect.objectContaining({ code: 'XN99', kind: 'Lab', group_key: 'immunology', price: 60000, ref_low: 0, ref_high: 5 }))
  })

  it('sửa dịch vụ: không gửi mã và loại (server không cho đổi)', async () => {
    await live.saveLiveRow('services', { id: 's1', code: 'DV01', name: 'Khám bệnh', group: 'consult', unit: 'lần', price: 90000 })
    const body = api.updateService.mock.calls[0][1]
    expect(api.updateService.mock.calls[0][0]).toBe('s1')
    expect(body).toMatchObject({ name: 'Khám bệnh', price: 90000 })
    expect(body.code).toBeUndefined()
    expect(body.kind).toBeUndefined()
  })

  it('gói khám: dịch vụ trong gói gửi bằng service_id lấy theo mã', async () => {
    await live.saveLiveRow('packages', { code: 'GK02', name: 'Gói 2', price: 200000, items: [{ ref: 'service:DV01', qty: 1 }, { ref: 'lab:XN01', qty: 2 }] })
    expect(api.createPackage).toHaveBeenCalledWith({ code: 'GK02', name: 'Gói 2', price: 200000, items: [{ service_id: 's1', quantity: 1 }, { service_id: 's2', quantity: 2 }] })
  })

  it('lỗi server (trùng mã…) trả về câu báo lỗi, không ném lỗi ra màn hình', async () => {
    api.createService.mockRejectedValueOnce(new Error('boom'))
    const r = await live.saveLiveRow('services', { code: 'DV01', name: 'x', group: 'consult', price: 1 })
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })
})
