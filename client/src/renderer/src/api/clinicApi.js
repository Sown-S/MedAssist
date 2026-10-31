// Lời gọi API thật cho Tiếp đón và Hàng đợi (chỉ dùng khi tắt giả lập — xem DEMO_MODE trong client.js).
// Đổi dữ liệu server sang đúng hình dạng các màn hình đang dùng, để giao diện không phải viết lại.
// Hợp đồng: docs đối chiếu API của Sơn (19/10) và trả lời bổ sung ngày 20/10.
import { apiGet, apiPost, apiRequest, ApiError } from './client'
import { VITAL_KEYS } from './vitals'

const V1 = '/api/v1'

// ---------- Bệnh nhân ----------
// Ngày sinh: client dùng dd/mm/yyyy, server dùng ISO yyyy-mm-dd.
export const isoDob = (dmy) => {
  const m = String(dmy ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}
export const dmyDob = (iso) => {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
// Ô ngày sinh: gõ số liền nhau → tự chèn dấu "/" thành dd/mm/yyyy.
export const maskDob = (s) => {
  const d = s.replace(/\D/g, '').slice(0, 8)
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/')
}
// Mang thai: 'yes' | 'no' | '' (chưa hỏi) ↔ medical_history.is_pregnant true | false | (không có khoá).
const pregnancyOf = (mh) => (mh?.is_pregnant === true ? 'yes' : mh?.is_pregnant === false ? 'no' : '')

// Hồ sơ server → hình dạng patientStore (id, name, dob dd/mm/yyyy, phone, ...). Giữ medicalHistory để PATCH không làm mất dữ liệu.
export function toPatient(p) {
  const mh = p.medical_history ?? null
  return {
    id: p.patient_id,
    code: p.patient_code,
    name: p.full_name,
    dob: dmyDob(p.date_of_birth),
    gender: p.gender,
    phone: p.phone ?? '',
    idNumber: p.id_number ?? '',
    allergies: p.allergy_notes ?? '',
    history: [...(mh?.chronic_conditions ?? []), mh?.notes].filter(Boolean).join(', '),
    pregnancy: pregnancyOf(mh),
    medicalHistory: mh
  }
}

// Ô tìm kiếm duy nhất ở quầy: mã BN, SĐT, CCCD, năm sinh, họ tên (có dấu hay không đều được).
export async function lookupPatients(term, limit = 20) {
  const r = await apiGet(`${V1}/patients/lookup?term=${encodeURIComponent(term)}&limit=${limit}`)
  return r.items.map((x) => ({ ...toPatient(x), dob: dmyDob(x.date_of_birth) }))
}

export const getPatient = async (id) => toPatient(await apiGet(`${V1}/patients/${id}`))

// Tạo hồ sơ. Lỗi 409 POSSIBLE_DUPLICATE (cùng họ tên + ngày sinh) → { duplicates }, gửi lại với confirmDuplicate.
export async function createPatient(f, { confirmDuplicate = false } = {}) {
  const body = {
    full_name: f.name.trim(),
    date_of_birth: isoDob(f.dob),
    gender: f.gender,
    phone: f.phone.trim() || null,
    id_number: f.idNumber?.trim() || null,
    allergy_notes: f.allergies?.trim() || null,
    confirm_duplicate: confirmDuplicate
  }
  const history = f.history?.trim()
  const pregnant = f.pregnancy === 'yes' ? true : f.pregnancy === 'no' ? false : undefined
  if (history || pregnant !== undefined)
    body.medical_history = { ...(history ? { notes: history } : {}), ...(pregnant !== undefined ? { is_pregnant: pregnant } : {}) }
  try {
    return { ok: true, patient: toPatient(await apiPost(`${V1}/patients`, body)) }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'POSSIBLE_DUPLICATE')
      return { ok: false, duplicates: e.details.map((d) => ({ ...toPatient(d), dob: dmyDob(d.date_of_birth) })) }
    if (e instanceof ApiError && e.code === 'DUPLICATE_ID_NUMBER') {
      const owner = await getPatient(e.details[0].patient_id)
      return { ok: false, duplicates: [owner], idTaken: true }
    }
    throw e
  }
}

// Ghi tình trạng mang thai vào hồ sơ — gửi lại TOÀN BỘ medical_history để không mất bệnh nền / ghi chú.
export async function setPregnancy(patient, pregnancy) {
  if (pregnancy === (patient.pregnancy ?? '')) return
  const mh = { ...(patient.medicalHistory ?? {}) }
  if (pregnancy === 'yes' || pregnancy === 'no') mh.is_pregnant = pregnancy === 'yes'
  else delete mh.is_pregnant
  await apiRequest(`${V1}/patients/${patient.id}`, 'PATCH', { medical_history: mh })
}

// ---------- Lượt khám ----------
// Lý do khám (bắt buộc) = câu đầu của lời kể; lời kể đầy đủ là văn bản để AI trích xuất triệu chứng.
export const chiefComplaintOf = (text) => (String(text ?? '').trim().split(/[.\n]/)[0].trim() || 'Khám bệnh').slice(0, 2000)

export async function createVisit(patientId, { text, vitals }) {
  return apiPost(`${V1}/visits`, {
    patient_id: patientId,
    chief_complaint: chiefComplaintOf(text),
    free_text_description: String(text ?? '').trim() || null,
    vital_signs: Object.keys(vitals ?? {}).length ? vitals : null
  })
}
// Chỉ sửa được khi lượt còn Waiting (server trả 409 VISIT_LOCKED).
export const updateVisit = (visitId, { text, vitals }) =>
  apiRequest(`${V1}/visits/${visitId}`, 'PATCH', {
    ...(text !== undefined ? { chief_complaint: chiefComplaintOf(text), free_text_description: String(text).trim() || null } : {}),
    ...(vitals !== undefined ? { vital_signs: Object.keys(vitals).length ? vitals : null } : {})
  })
export const putSymptoms = (visitId, symptoms) => apiRequest(`${V1}/visits/${visitId}/symptoms`, 'PUT', { symptoms })
export const getVisitSymptoms = (visitId) => apiGet(`${V1}/visits/${visitId}/symptoms`)
export const checkIn = (visitId) => apiRequest(`${V1}/visits/${visitId}/check-in`, 'PATCH')
// Bác sĩ nhận khám (CheckedIn → Examining). Bác sĩ khác nhận trước → 409 VISIT_TAKEN.
export const startExam = (visitId) => apiRequest(`${V1}/visits/${visitId}/start-exam`, 'PATCH')
// Trả về hàng chờ (nhận nhầm) — không được khi đã có chẩn đoán (409 HAS_DIAGNOSIS).
export const releaseVisit = (visitId) => apiRequest(`${V1}/visits/${visitId}/release`, 'PATCH')

// Chi tiết cho phiếu khám (hàng đợi chỉ có thông tin tóm tắt): sinh hiệu, lời kể, triệu chứng đã xác nhận, hồ sơ.
export async function getVisitDetail(visitId, patientId) {
  const [v, symptoms, p] = await Promise.all([
    apiGet(`${V1}/visits/${visitId}`),
    getVisitSymptoms(visitId),
    getPatient(patientId)
  ])
  return {
    reason: v.free_text_description || v.chief_complaint,
    vitals: v.vital_signs ?? {},
    symptoms: symptoms.filter((x) => x.state !== 'UNKNOWN'),
    allergies: p.allergies,
    history: p.history,
    pregnancy: p.pregnancy,
    phone: p.phone,
    patientCode: p.code,
    dob: p.dob
  }
}
export const cancelVisit = (visitId, reason) => apiRequest(`${V1}/visits/${visitId}/cancel`, 'PATCH', { reason })

// ---------- Đánh giá AI / phân loại ----------
// POST chạy luật cờ đỏ + ưu tiên ngay (kết quả có priority, alerts), phần AI chạy nền → GET hỏi lại tới khi xong.
export const triggerAssessment = (visitId) => apiPost(`${V1}/visits/${visitId}/assessment`)
export async function getAssessment(visitId) {
  try {
    return await apiGet(`${V1}/visits/${visitId}/assessment`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}
export const assessmentPending = (a) => !!a && ['Pending', 'Preliminary'].includes(a.ai_status)

// Mức phân loại của server → mức client: Emergency → emergency, HighPriority → high, còn lại routine.
export const triageOf = (priority) => (priority === 'Emergency' ? 'emergency' : priority === 'HighPriority' ? 'high' : 'routine')

// Mục "cần hỏi / đo ngay": server gửi khoá sinh hiệu dạng "vital_signs.spo2_pct" kèm tên chưa dịch → đổi sang nhãn sinh hiệu.
export const missingName = (x) => {
  if (!x.symptom_code.startsWith('vital_signs.')) return x.symptom_name
  const key = x.symptom_code.slice('vital_signs.'.length)
  return VITAL_KEYS.find((d) => d.key === key)?.label ?? key
}

// ---------- Trích xuất triệu chứng từ lời kể (HITL) ----------
// Lượt phải còn Waiting và đã lưu lời kể. Hỏi lại khoảng 2 giây một lần, dừng sau timeoutMs.
// Trả về { status: 'Completed', proposals } như bản giả lập; Failed → lỗi AI_UNAVAILABLE.
export async function extractSymptoms(visitId, { signal, timeoutMs = 30000 } = {}) {
  let r = await apiPost(`${V1}/visits/${visitId}/symptom-extraction`)
  const until = Date.now() + timeoutMs
  while (['Queued', 'Running'].includes(r.status)) {
    if (Date.now() > until) throw Object.assign(new Error('timeout'), { code: 'ABORTED' })
    await new Promise((ok, fail) => {
      const t = setTimeout(ok, 2000)
      signal?.addEventListener('abort', () => (clearTimeout(t), fail(Object.assign(new Error('aborted'), { code: 'ABORTED' }))))
    })
    r = await apiGet(`${V1}/visits/${visitId}/symptom-extraction`)
  }
  if (r.status !== 'Completed') throw Object.assign(new Error('Extraction unavailable'), { code: 'AI_UNAVAILABLE' })
  return {
    status: 'Completed',
    proposals: r.suggestions.filter((s) => s.status !== 'UNKNOWN').map((s) => ({ symptom_code: s.symptom_code, state: s.status, phrase: '' }))
  }
}

// ---------- Hàng đợi ----------
// Một dòng GET /queue → hình dạng lượt khám của queueStore (thẻ hàng chờ, gọi số, đếm số liệu).
const ageFrom = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(+d)) return ''
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
  return a
}
export function toQueueVisit(q) {
  const triage = q.is_red_flag ? 'emergency' : triageOf(q.triage_priority)
  return {
    id: q.visit_id,
    ticket: q.queue_number,
    patientId: q.patient_id,
    name: q.patient_name,
    gender: q.gender,
    age: ageFrom(q.date_of_birth),
    reason: q.chief_complaint,
    status: q.status,
    triage,
    priority: triage !== 'routine',
    redFlagReason: q.red_flag_reason,
    aiStatus: q.ai_status,
    arrivedAt: q.visit_date,
    checkedInAt: q.checked_in_at,
    statusAt: q.exam_started_at ?? q.checked_in_at ?? q.visit_date,
    doctor: q.physician_name ?? '',
    doctorId: q.physician_id,
    // Phòng của bác sĩ đang khám (null khi chưa ai nhận) — lượt khám không lưu phòng riêng
    room: q.room_name || q.room || '',
    // Đi xét nghiệm và lời mời vào phòng do server giữ để máy quầy cũng thấy (ERD v2.0)
    labOut: !!q.lab_out_at,
    labOutAt: q.lab_out_at ?? null,
    calledAt: q.called_at ?? null,
    calledById: q.called_by ?? null,
    calledByName: q.called_by_name ?? '',
    calledRoom: q.called_room_name || q.called_room || '',
    symptoms: [],
    vitals: {},
    rx: [],
    absent: false,
    fromServer: true
  }
}
export const fetchQueue = async () => (await apiGet(`${V1}/queue`)).map(toQueueVisit)
export const fetchStale = async () => (await apiGet(`${V1}/visits/stale`)).map((q) => ({ ...toQueueVisit(q), carriedFrom: q.queue_date }))
export const cancelStale = (ids, reason) => apiPost(`${V1}/visits/stale/cancel`, { visit_ids: ids, reason })

// ---------- Xét nghiệm, mời vào phòng ----------
export const labOut = (visitId) => apiRequest(`${V1}/visits/${visitId}/lab-out`, 'PATCH')
export const labReturn = (visitId) => apiRequest(`${V1}/visits/${visitId}/lab-return`, 'PATCH')
export const callNext = () => apiPost(`${V1}/queue/call-next`)
export const callVisit = (visitId) => apiPost(`${V1}/visits/${visitId}/call`)
export const cancelCall = (visitId) => apiRequest(`${V1}/visits/${visitId}/call`, 'DELETE')

// ---------- Chuyển tuyến ----------
// referral: { facility_id?, facility_name, reason, diagnosis?, summary?, treatment?, condition?, transport?, signs? }
// transport: 'Ambulance' | 'Family' | 'Self' | 'Other'
export const searchFacilities = (q, limit = 10) => apiGet(`${V1}/referral-facilities?q=${encodeURIComponent(q)}&limit=${limit}`)
export const referVisit = (visitId, referral) => apiRequest(`${V1}/visits/${visitId}/refer`, 'PATCH', referral)
export const emergencyReferral = (patientId, chiefComplaint, referral, vitalSigns) =>
  apiPost(`${V1}/visits/emergency-referral`, { patient_id: patientId, chief_complaint: chiefComplaint, referral, ...(vitalSigns ? { vital_signs: vitalSigns } : {}) })
export const updateReferral = (visitId, fields) => apiRequest(`${V1}/visits/${visitId}/referral`, 'PATCH', fields)
