import { vi } from 'vitest'
import { DOC_A } from './helpers'

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

const ROUTES = [
  [/^\/health$/, () => ({ status: 'healthy', database: { ok: true, detail: '' }, ai: { ok: true, detail: '' }, version: 'test' })],
  [/^\/api\/v1\/queue$/, () => QUEUE],
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

export function installFakeServer() {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(respond))
}
