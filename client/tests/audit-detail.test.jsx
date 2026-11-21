import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'

// Lịch sử hoạt động: phần chi tiết hiện tên thuốc thay cho chuỗi drug_id; hành động tạo hiện "Tạo mới".
const DRUG = '6b607338-5713-463b-a86f-4b089624cb55'
vi.mock('../src/renderer/src/api/auditApi', async (orig) => ({
  ...(await orig()),
  listAuditLogs: () =>
    Promise.resolve({
      total: 1,
      items: [{ log_id: 'l1', created_at: '2026-11-14T00:20:30+07:00', action_type: 'CREATE', username: 'system', target_entity: 'inventory_batch', entity_id: 'b1', old_values: null, new_values: { drug_id: DRUG, quantity: 30, batch_number: 'EVAL-NEAR-6B6073' }, ip_address: null }]
    })
}))
vi.mock('../src/renderer/src/api/serverDrugs', () => ({ useServerDrugs: () => ({ drugs: [{ id: DRUG, name: 'Sắt + Acid folic 60 mg + 0,25 mg' }] }) }))
vi.mock('../src/renderer/src/context/ToastContext', () => ({ useToast: () => ({ showToast: () => {} }) }))

import HistoryPage from '../src/renderer/src/pages/admin/HistoryPage'
import { ACTION_LABEL } from '../src/renderer/src/api/auditApi'
import { VI } from '../src/renderer/src/i18n/vi'

describe('Lịch sử hoạt động — chi tiết', () => {
  it('drug_id hiện thành tên thuốc, không còn chuỗi mã', async () => {
    const { container } = render(<HistoryPage />)
    await waitFor(() => expect(container.querySelector('tbody tr.pointer')).toBeTruthy())
    // Nhãn hành động tạo không dùng chung chữ 'Created' (đã dịch là 'Ngày tạo' cho cột ngày).
    expect(VI[ACTION_LABEL.CREATE]).toBe('Tạo mới')
    fireEvent.click(container.querySelector('tbody tr.pointer'))
    const detail = container.querySelector('.audit-detail')
    expect(detail.textContent).toContain('Sắt + Acid folic 60 mg + 0,25 mg')
    expect(detail.textContent).not.toContain(DRUG)
    expect(detail.textContent).toContain('EVAL-NEAR-6B6073')
  })
})
