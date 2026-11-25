// Mẫu in (phiếu số, biên lai, đơn thuốc, phiếu xét nghiệm) với dữ liệu cố định, tiếng Việt, khổ giấy mặc định.
// Mỗi mẫu là một file HTML trong tests/__print__/ (so như snapshot): đổi mẫu in thì file đổi theo và hiện trong diff PR.
// e2e/print.spec.mjs mở đúng các file này trong Electron và chụp ảnh so sánh.
// Cập nhật khi cố ý đổi mẫu: npx vitest run tests/print-templates.test.js -u
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

process.env.TZ = 'Asia/Ho_Chi_Minh'
const printed = []
vi.mock('../src/renderer/src/pages/admin/inventory/shared.jsx', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    printHtml: (title, body, doc) => {
      const { html, css, paper } = mod.buildPrintDocument(title, body, doc)
      printed.push({ paper, html: html.replace('</head>', `<style>${css}</style></head>`) })
    }
  }
})

const { setLang } = await import('../src/renderer/src/i18n/index.js')
const { printTicket, printReceipt } = await import('../src/renderer/src/components/queuePrint.js')
const { printPrescription } = await import('../src/renderer/src/pages/doctor/printRx.js')
const { printLabOrder } = await import('../src/renderer/src/pages/doctor/LabOrderModal.jsx')

const AT = '2026-11-20T09:05:00+07:00'
const last = () => printed.at(-1)
const pretty = (h) => h.replace(/></g, '>\n<')

beforeAll(() => setLang('vi'))
afterAll(() => setLang('en'))

describe('Mẫu in', () => {
  it('phiếu số thứ tự (80 mm)', async () => {
    printTicket({ ticket: 7, priority: true, name: 'Nguyễn Văn An', arrivedAt: AT })
    expect(last().paper).toBe('80mm')
    await expect(pretty(last().html)).toMatchFileSnapshot('__print__/ticket.html')
  })
  it('biên lai thu tiền (80 mm)', async () => {
    printReceipt({
      id: 'HD-20261120-0007',
      name: 'Nguyễn Văn An',
      ticket: 7,
      paidAt: AT,
      method: 'cash',
      total: 185000,
      byName: 'Lê Thị Hoa',
      items: [
        { name: 'Consultation fee', qty: 1, amount: 100000 },
        { name: 'Paracetamol 500mg', qty: 10, amount: 15000 },
        { name: 'Công thức máu', qty: 1, amount: 70000 }
      ]
    })
    await expect(pretty(last().html)).toMatchFileSnapshot('__print__/receipt.html')
  })
  it('đơn thuốc (A5)', async () => {
    printPrescription(
      {
        name: 'Nguyễn Văn An',
        gender: 'Male',
        age: 36,
        patientId: 'BN000123',
        phone: '0901234567',
        allergies: 'Penicillin',
        diagnosis: 'J02.9 — Viêm họng cấp',
        diagnosesExtra: ['R50.9 — Sốt'],
        plan: 'Uống nhiều nước, nghỉ ngơi.',
        followUp: '2026-11-27',
        rxAt: AT,
        rx: [
          { name: 'Paracetamol 500mg', qty: 10, unit: 'viên', usage: 'Sáng 1 viên, tối 1 viên — 5 ngày' },
          { name: 'Amoxicilin 500mg', qty: 14, unit: 'viên', usage: 'Sáng 1, trưa 1 — 7 ngày' }
        ]
      },
      [],
      'BS. Trần Minh Khoa'
    )
    expect(last().paper).toBe('A5')
    await expect(pretty(last().html)).toMatchFileSnapshot('__print__/prescription.html')
  })
  it('phiếu chỉ định xét nghiệm (A5)', async () => {
    printLabOrder(
      { ticket: 7, name: 'Nguyễn Văn An', gender: 'Male', age: 36, patientId: 'BN000123', phone: '0901234567' },
      {
        at: AT,
        diagnosis: 'J02.9 — Viêm họng cấp',
        by: 'BS. Trần Minh Khoa',
        note: 'Lấy mẫu buổi sáng',
        tests: [
          { name: 'Công thức máu', sample: 'blood' },
          { name: 'CRP', sample: 'blood' },
          { name: 'X-quang ngực thẳng', sample: 'none' }
        ]
      }
    )
    await expect(pretty(last().html)).toMatchFileSnapshot('__print__/lab-order.html')
  })
})
