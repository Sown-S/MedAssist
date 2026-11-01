import { vi } from 'vitest'
import { DOC_A, DOC_B } from './helpers'

// Server giả cho test giao diện: thay fetch, trả JSON đúng hình dạng API cho các endpoint màn hình gọi lúc dựng.
// Endpoint không khai báo: có limit= → trang rỗng { items, total }, còn lại → mảng rỗng.
const today = new Date().toISOString()
const day = today.slice(0, 10)

const QUEUE = [
  { visit_id: 'v-exam', queue_number: 1, patient_id: 'p1', patient_name: 'Nguyễn Văn An', gender: 'Male', date_of_birth: '1990-05-01', chief_complaint: 'Ho, sốt', status: 'Examining', triage_priority: 'Routine', is_red_flag: false, ai_status: 'Ready', visit_date: today, checked_in_at: today, exam_started_at: today, physician_id: DOC_A.id, physician_name: DOC_A.name, room_name: DOC_A.room },
  { visit_id: 'v-wait', queue_number: 2, patient_id: 'p2', patient_name: 'Trần Thị Bình', gender: 'Female', date_of_birth: '1985-02-10', chief_complaint: 'Đau họng', status: 'Waiting', triage_priority: 'Routine', is_red_flag: false, ai_status: 'Ready', visit_date: today, checked_in_at: null, exam_started_at: null, physician_id: null, physician_name: null }
]

const PATIENT = (id) => ({ patient_id: id, patient_code: 'BN000001', full_name: QUEUE.find((q) => q.patient_id === id)?.patient_name ?? 'Bệnh nhân', date_of_birth: '1990-05-01', gender: 'Male', phone: '0901234567', id_number: null, address: null, medical_history: null, allergy_notes: null, created_at: today, updated_at: today })

const zero = { total: 0, full: 0, rule_only: 0, failed: 0, skipped: 0, pending: 0, avg_latency_ms: null }
const SUMMARY = {
  date_from: day,
  date_to: day,
  visits: { total: 2, by_status: { Waiting: 1, Examining: 1 }, red_flags: 0, referred: 0 },
  revenue: { invoices_paid: 0, total: '0', consultation: '0', paraclinical: '0', drug: '0', by_day: [] },
  ai: { assessments: zero, decisions: { accepted_top: 0, chose_other: 0, no_suggestion: 0, acceptance_rate: null }, extractions: { total: 0, completed: 0, failed: 0 } }
}

// Đơn của bác sĩ B (phòng đang trống) còn chờ thanh toán, chưa cấp thuốc → thu hồi được.
const PRESCRIPTIONS = [
  { prescription_id: 'rx1', visit_id: 'v-paid-wait', visit_date: today, queue_number: 5, patient_code: 'BN000005', patient_name: 'Lê Văn Cường', physician_id: DOC_B.id, physician_name: DOC_B.name, status: 'Confirmed', confirmed_at: today, items: [{ drug_name: 'Paracetamol 500mg', unit: 'viên', quantity: 10, dosage: '1 viên', frequency: '3 lần/ngày', duration_days: 3, dispense_status: 'Pending' }], drug_total: '20000', invoice_status: 'Pending', invoice_total: '120000' }
]

// Danh mục thuốc như server: tên thương mại khác tên hoạt chất (đơn mẫu phải tra theo hoạt chất + hàm lượng).
const DRUGS = [
  { drug_id: 'd-amox', generic_name: 'Amoxicilin', trade_name: 'Amoxicilin 500', strength: '500 mg', dosage_form: 'viên nang', unit: 'viên', sale_price: '1500', is_active: true },
  { drug_id: 'd-pana', generic_name: 'Paracetamol', trade_name: 'Panadol', strength: '500 mg', dosage_form: 'viên nén', unit: 'viên', sale_price: '1000', is_active: true }
]
const STOCK = DRUGS.map((d) => ({ drug_id: d.drug_id, usable_quantity: 100, near_expiry_quantity: 0, expired_quantity: 0 }))
// Bệnh nhân đang khám (p1) có một lần khám trước, kèm đơn thuốc.
const HISTORY = {
  patient: { patient_code: 'BN000001', full_name: 'Nguyễn Văn An', date_of_birth: '1990-05-01', gender: 'Male', medical_history: null, allergy_notes: null },
  total: 2,
  limit: 10,
  offset: 0,
  items: [
    { visit_id: 'v-exam', visit_date: today, status: 'Examining', chief_complaint: 'Ho, sốt', triage_priority: 'Routine', is_red_flag: false, physician_name: DOC_A.name, diagnoses: [], prescription: null },
    {
      visit_id: 'v-old', visit_date: '2026-10-20T08:00:00Z', status: 'Finished', chief_complaint: 'Đau họng', triage_priority: 'Routine', is_red_flag: false, physician_name: DOC_A.name,
      diagnoses: [{ diagnosis_name: 'Viêm họng cấp', icd10_code: 'J02.9', is_primary: true }],
      prescription: { prescription_id: 'rx-old', status: 'Dispensed', confirmed_at: '2026-10-20T08:30:00Z', item_count: 1, items: [{ drug_label: 'Paracetamol 500 mg (Panadol)', quantity: 10, unit: 'viên', dosage: '1 viên', frequency: '3 lần/ngày', duration_days: 3, dispense_status: 'Dispensed' }] }
    }
  ]
}

const ROUTES = [
  [/^\/health$/, () => ({ status: 'healthy', database: { ok: true, detail: '' }, ai: { ok: true, detail: '' }, version: 'test' })],
  [/^\/api\/v1\/queue$/, () => QUEUE],
  [/^\/api\/v1\/prescriptions$/, () => PRESCRIPTIONS],
  [/^\/api\/v1\/drugs$/, () => ({ items: DRUGS, total: DRUGS.length })],
  [/^\/api\/v1\/inventory\/stock$/, () => STOCK],
  [/^\/api\/v1\/patients\/p1\/history$/, () => HISTORY],
  [/^\/api\/v1\/visits\/v-exam\/symptoms$/, () => [{ symptom_code: 'anemia_pallor_jaundice', symptom_name: 'Da xanh xao, vàng da', state: 'PRESENT', source: 'Form', confirmed_at: today }]],
  [/^\/api\/v1\/symptoms$/, () => [{ symptom_code: 'fever', symptom_name: 'Sốt', category: 'constitutional' }]],
  [/^\/api\/v1\/reports\/summary/, () => SUMMARY],
  [/^\/api\/v1\/auth\/password-policy$/, () => ({ min_length: 8, require_letters_and_digits: true, max_failed_attempts: 5, failed_window_minutes: 15, lock_minutes: 5 })],
  [/^\/api\/v1\/patients\/[^/?]+$/, (path) => PATIENT(path.split('/').pop())],
  [/^\/api\/v1\/visits\/[^/?]+$/, () => ({ free_text_description: 'Ho, sốt 2 ngày', chief_complaint: 'Ho, sốt', vital_signs: {} })],
  [/^\/api\/v1\/visits\/[^/]+\/(assessment|prescription)$/, () => ({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'Không tìm thấy' } } })]
]

export const calls = []

async function respond(url, init = {}) {
  const { pathname, search } = new URL(url)
  const method = init.method ?? 'GET'
  calls.push({ method, path: pathname + search, body: init.body ? JSON.parse(init.body) : undefined })
  let body = method === 'GET' ? (search.includes('limit=') ? { items: [], total: 0 } : []) : {}
  let status = 200
  if (method === 'GET') {
    const hit = ROUTES.find(([re]) => re.test(pathname))
    if (hit) {
      const r = hit[1](pathname)
      if (r?.status && r.body) ({ status, body } = r)
      else body = r
    }
  }
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export function resetCalls() {
  calls.length = 0
}

export function installFakeServer() {
  resetCalls()
  vi.stubGlobal('fetch', vi.fn(respond))
}
