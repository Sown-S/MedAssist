// Cấu hình AI của bản demo (luật, tương tác thuốc, cài đặt, kho tài liệu) lưu trong localStorage.
// Chạy thật dùng kho tri thức trên server; luật “người duyệt phải là bác sĩ khác người soạn” do server kiểm.
import { useSyncExternalStore } from 'react'
import { logEvent } from './activityStore'

const KEY = 'medassist_ai_config_v1'

const now = () => new Date().toISOString()
const stats = (accepted, dismissed, fn, reasons = {}) => ({
  fired: accepted + dismissed,
  accepted,
  dismissed,
  reasons,
  tp: accepted,
  fp: dismissed,
  fn
})

function rule(id, type, cond, icd, weight, rationale, reference, extra = {}) {
  return {
    id,
    type,
    cond: { symptoms: [], absent: [], ageMin: null, ageMax: null, minDays: null, vitals: [], ...cond },
    icd,
    weight,
    rationale,
    reference,
    enabled: true,
    retired: false,
    version: 1,
    updatedBy: 'System Administrator',
    updatedAt: '2026-09-02T08:30:00.000Z',
    approvedBy: 'Trần Minh',
    pending: null,
    history: [],
    stats: stats(0, 0, 0),
    ...extra
  }
}

const RULE_FIELDS = ['type', 'cond', 'icd', 'weight', 'rationale', 'reference', 'enabled', 'retired']
export const pickRuleData = (r) => Object.fromEntries(RULE_FIELDS.map((k) => [k, r[k]]))

function seedRules() {
  const list = [
    rule(
      'R-001',
      'redflag',
      { symptoms: ['chest_pain', 'dyspnea'] },
      'I24.9',
      0.98,
      'Đau ngực kèm khó thở là dấu hiệu gợi ý hội chứng vành cấp — cần chuyển cấp cứu, không chờ khám theo thứ tự.',
      'Hướng dẫn chẩn đoán và điều trị hội chứng mạch vành cấp — Bộ Y tế 2019',
      { stats: stats(9, 1, 0, { differs: 1 }) }
    ),
    rule(
      'R-002',
      'redflag',
      { vitals: [{ key: 'spo2', op: '<', value: 92 }] },
      'R06.0',
      0.97,
      'SpO₂ dưới 92% là giảm oxy máu đáng kể, cần đánh giá hô hấp ngay.',
      'WHO — Oxygen therapy for children (2016); BTS Guideline 2017',
      { stats: stats(4, 0, 1) }
    ),
    rule(
      'R-003',
      'redflag',
      { symptoms: ['fever', 'headache', 'neck_stiffness'] },
      'G03.9',
      0.96,
      'Bộ ba sốt – đau đầu – cứng gáy gợi ý viêm màng não; cần xử trí khẩn.',
      'Hướng dẫn chẩn đoán, điều trị bệnh truyền nhiễm — Bộ Y tế 2015',
      { stats: stats(1, 0, 0) }
    ),
    rule(
      'R-004',
      'priority',
      { ageMax: 15, vitals: [{ key: 'temp', op: '>', value: 39 }] },
      'R50.9',
      0.95,
      'Trẻ em sốt trên 39°C có nguy cơ co giật do sốt, cần được ưu tiên khám trước.',
      'Phác đồ Nhi khoa — BV Nhi Đồng 1 (2020)',
      {
        version: 2,
        updatedAt: '2026-09-20T02:10:00.000Z',
        history: [
          {
            version: 1,
            at: '2026-09-02T08:30:00.000Z',
            by: 'System Administrator',
            approvedBy: 'Trần Minh',
            note: 'Tạo mới',
            snap: null
          }
        ],
        stats: stats(31, 3, 2, { info: 2, known: 1 })
      }
    ),
    rule(
      'R-005',
      'dx',
      { symptoms: ['sore_throat', 'tonsil_exudate', 'fever'], vitals: [{ key: 'temp', op: '>=', value: 38.5 }] },
      'J03.9',
      0.8,
      'Đau họng, amidan có mủ và sốt ≥ 38,5°C thoả nhiều tiêu chí Centor — gợi ý viêm amidan cấp.',
      'Tiêu chuẩn Centor/McIsaac; Phác đồ Tai Mũi Họng — Bộ Y tế 2015',
      { stats: stats(46, 9, 6, { differs: 5, info: 3, broad: 1 }) }
    ),
    rule(
      'R-006',
      'dx',
      { symptoms: ['sore_throat', 'fever'], vitals: [{ key: 'temp', op: '<', value: 38.5 }] },
      'J02.9',
      0.7,
      'Đau họng kèm sốt nhẹ, không có mủ amidan — thường gặp trong viêm họng cấp do virus.',
      'Phác đồ Tai Mũi Họng — Bộ Y tế 2015',
      { stats: stats(38, 14, 9, { differs: 8, broad: 4, info: 2 }) }
    ),
    rule(
      'R-007',
      'dx',
      { symptoms: ['cough_dry'], minDays: 21 },
      'J42',
      0.6,
      'Ho khan kéo dài trên 3 tuần cần theo dõi viêm phế quản mạn và loại trừ lao.',
      'Hướng dẫn chẩn đoán và điều trị bệnh hô hấp — Bộ Y tế 2012',
      { stats: stats(7, 5, 3, { differs: 3, info: 2 }) }
    ),
    rule(
      'R-008',
      'dx',
      { symptoms: ['epigastric_pain', 'acid_reflux'] },
      'K29.7',
      0.75,
      'Đau thượng vị kèm ợ chua gợi ý viêm dạ dày; cân nhắc trào ngược dạ dày – thực quản.',
      'Hướng dẫn chẩn đoán và điều trị bệnh tiêu hoá — Bộ Y tế 2015',
      { stats: stats(22, 6, 4, { differs: 4, known: 2 }) }
    ),
    rule(
      'R-009',
      'dx',
      { symptoms: ['runny_nose', 'sneezing'], absent: ['fever'] },
      'J30.4',
      0.55,
      'Sổ mũi, hắt hơi nhưng không sốt — phân biệt với cảm lạnh do virus, gợi ý viêm mũi dị ứng.',
      'ARIA Guideline 2019',
      { stats: stats(12, 8, 2, { differs: 6, broad: 2 }) }
    ),
    rule(
      'R-010',
      'dx',
      { symptoms: ['fever', 'runny_nose', 'sore_throat'] },
      'J06.9',
      0.65,
      'Sốt, sổ mũi, đau họng — bệnh cảnh nhiễm trùng hô hấp trên cấp.',
      'Phác đồ Tai Mũi Họng — Bộ Y tế 2015',
      { enabled: false, version: 2, updatedAt: '2026-10-03T03:00:00.000Z', stats: stats(15, 19, 1, { broad: 12, differs: 7 }) }
    ),
    rule(
      'R-011',
      'dx',
      { symptoms: ['cough_dry'] },
      'J20.9',
      0.5,
      'Quy tắc cũ, quá rộng — đã thay bằng R-007.',
      'Nội bộ',
      { retired: true, version: 3, updatedAt: '2026-09-15T07:00:00.000Z', stats: stats(4, 21, 0, { broad: 18, differs: 3 }) }
    )
  ]
  const r008 = list.find((r) => r.id === 'R-008')
  r008.pending = {
    kind: 'edit',
    stage: 'draft',
    data: { ...pickRuleData(r008), weight: 0.7 },
    by: 'System Administrator',
    byUser: 'admin',
    at: '2026-10-13T09:40:00.000Z',
    note: 'Giảm trọng số do tỷ lệ bỏ qua cao ở bệnh nhân đã có chẩn đoán trào ngược.'
  }
  const draft = rule(
    'R-012',
    'dx',
    { symptoms: ['sore_throat', 'fever'], vitals: [{ key: 'temp', op: '<', value: 38.5 }] },
    'J03.9',
    0.7,
    'Đề xuất thêm gợi ý viêm amidan cho ca đau họng sốt nhẹ.',
    'Ý kiến khoa khám',
    { version: 0, updatedAt: null, approvedBy: null }
  )
  draft.pending = {
    kind: 'create',
    stage: 'review',
    data: pickRuleData(draft),
    by: 'System Administrator',
    byUser: 'admin',
    at: '2026-10-14T01:15:00.000Z',
    note: 'Đề xuất quy tắc mới.'
  }
  list.push(draft)
  return list
}

const SEED_DDI = [
  { id: 'D-001', a: 'Amoxicillin', aAtc: 'J01CA04', b: 'Penicillin allergy', type: 'allergy', level: 'contraindicated', source: 'Dược thư Quốc gia Việt Nam 2022' },
  { id: 'D-002', a: 'Cefuroxim', aAtc: 'J01DC02', b: 'Penicillin allergy', type: 'allergy', level: 'severe', source: 'Dược thư Quốc gia Việt Nam 2022' },
  { id: 'D-003', a: 'Ceftriaxon', aAtc: 'J01DD04', b: 'Penicillin allergy', type: 'allergy', level: 'warning', source: 'BNF 86 (2023)' },
  { id: 'D-004', a: 'Paracetamol', aAtc: 'N02BE01', b: 'Max 4,000 mg/day (adult)', type: 'dose', level: 'severe', source: 'Dược thư Quốc gia Việt Nam 2022' },
  { id: 'D-005', a: 'Paracetamol', aAtc: 'N02BE01', b: 'Max 60 mg/kg/day (child)', type: 'dose', level: 'severe', source: 'BNF for Children 2023' },
  { id: 'D-006', a: 'Ibuprofen', aAtc: 'M01AE01', b: 'Max 2,400 mg/day (adult)', type: 'dose', level: 'warning', source: 'BNF 86 (2023)' },
  { id: 'D-007', a: 'Aspirin', aAtc: 'B01AC06', b: 'Warfarin (B01AA03)', type: 'ddi', level: 'severe', source: "Stockley's Drug Interactions" },
  { id: 'D-008', a: 'NSAIDs (class)', aAtc: 'M01A', b: 'Chronic kidney disease', type: 'condition', level: 'contraindicated', source: 'KDIGO 2012' },
  { id: 'D-009', a: 'Amoxicillin', aAtc: 'J01CA04', b: 'Cefuroxim (J01DC02)', type: 'class', level: 'warning', source: 'Dược thư Quốc gia Việt Nam 2022' },
  { id: 'D-010', a: 'Omeprazol', aAtc: 'A02BC01', b: 'Clopidogrel (B01AC04)', type: 'ddi', level: 'warning', source: 'FDA Drug Safety Communication 2009' }
]

// Client chỉ bật / tắt module; tên model do server báo. maxSuggestions / minConfidence chỉ dùng cho tab Thử luật —
// server tự giới hạn 3 ứng viên và client không gọi thẳng LLM.
const SEED_SETTINGS = {
  enabled: true,
  model: 'gemma-sea-lion-v3-9b-it',
  maxSuggestions: 3,
  minConfidence: 0.6
}

const SEED_KB = [
  { id: 'KB-01', title: 'Phác đồ Tai Mũi Họng — Bộ Y tế 2015', file: 'kb/tai-mui-hong.okf', format: 'OKF', chunks: 214, updatedAt: '2026-10-01T02:00:00.000Z', status: 'indexed' },
  { id: 'KB-02', title: 'Hướng dẫn bệnh hô hấp — Bộ Y tế 2012', file: 'kb/ho-hap.okf', format: 'OKF', chunks: 388, updatedAt: '2026-09-12T02:00:00.000Z', status: 'indexed' },
  { id: 'KB-03', title: 'Hướng dẫn bệnh tiêu hoá — Bộ Y tế 2015', file: 'kb/tieu-hoa.md', format: 'Markdown', chunks: 167, updatedAt: '2026-08-20T02:00:00.000Z', status: 'outdated' },
  { id: 'KB-04', title: 'Dược thư Quốc gia Việt Nam 2022 (trích)', file: 'kb/duoc-thu-2022.md', format: 'Markdown', chunks: 1240, updatedAt: '2026-09-28T02:00:00.000Z', status: 'indexed' },
  { id: 'KB-05', title: 'Dấu hiệu cờ đỏ ngoại trú — quy trình nội bộ', file: 'kb/co-do-noi-bo.md', format: 'Markdown', chunks: 26, updatedAt: '2026-10-10T02:00:00.000Z', status: 'indexed' }
]

const SEED_SYNONYMS = {
  fever: ['sốt', 'nóng sốt', 'sốt cao', 'ấm đầu', 'người hâm hấp', 'nóng người'],
  cough_dry: ['ho khan', 'ho không đờm', 'ho húng hắng'],
  cough_productive: ['ho có đờm', 'ho đờm', 'khạc đờm', 'ho ra đàm'],
  sore_throat: ['đau họng', 'rát họng', 'nuốt đau', 'viêm họng'],
  tonsil_exudate: ['amidan có mủ', 'mủ amidan', 'amidan có chấm trắng'],
  runny_nose: ['sổ mũi', 'chảy nước mũi', 'nghẹt mũi'],
  sneezing: ['hắt hơi', 'hắt xì'],
  headache: ['đau đầu', 'nhức đầu', 'đau nửa đầu'],
  neck_stiffness: ['cứng gáy', 'cứng cổ', 'không cúi được cổ'],
  chest_pain: ['đau ngực', 'tức ngực', 'đau thắt ngực', 'nặng ngực'],
  dyspnea: ['khó thở', 'thở dốc', 'hụt hơi', 'thở không nổi'],
  epigastric_pain: ['đau thượng vị', 'đau bụng trên', 'đau vùng thượng vị', 'đau bao tử'],
  acid_reflux: ['ợ chua', 'ợ nóng', 'trào ngược'],
  vomiting: ['nôn', 'ói', 'buồn nôn'],
  rash: ['phát ban', 'nổi mẩn', 'nổi ban đỏ'],
  altered_consciousness: ['lơ mơ', 'li bì', 'lú lẫn', 'ngất']
}

const SEED_REQUIRED = [
  { key: 'age', label: 'Age', question: 'Bệnh nhân bao nhiêu tuổi?', required: true },
  { key: 'sex', label: 'Sex', question: 'Giới tính của bệnh nhân?', required: true },
  { key: 'days', label: 'Symptom duration', question: 'Triệu chứng xuất hiện bao nhiêu ngày rồi?', required: true },
  { key: 'temp', label: 'Temperature', question: 'Nhiệt độ đo được bao nhiêu độ?', required: true },
  { key: 'allergies', label: 'Drug allergies', question: 'Bệnh nhân có dị ứng thuốc nào không?', required: true },
  { key: 'meds', label: 'Current medications', question: 'Bệnh nhân đang dùng thuốc gì?', required: true },
  { key: 'pregnancy', label: 'Pregnancy (women 15–49)', question: 'Bệnh nhân có đang mang thai không?', required: true },
  { key: 'spo2', label: 'SpO₂', question: 'SpO₂ đo được bao nhiêu?', required: false }
]

const SEED_AUDIT = [
  { at: '2026-10-14T01:15:00.000Z', by: 'System Administrator', target: 'R-012', action: 'Submitted for review', note: 'Đề xuất quy tắc mới.' },
  { at: '2026-10-13T09:40:00.000Z', by: 'System Administrator', target: 'R-008', action: 'Draft saved', note: 'Giảm trọng số do tỷ lệ bỏ qua cao ở bệnh nhân đã có chẩn đoán trào ngược.' },
  { at: '2026-10-03T03:00:00.000Z', by: 'Trần Minh', target: 'R-010', action: 'Approved & applied', note: 'Tắt tạm — tỷ lệ bỏ qua > 50%.' },
  { at: '2026-09-20T02:10:00.000Z', by: 'Trần Minh', target: 'R-004', action: 'Approved & applied', note: 'Hạ ngưỡng tuổi từ 16 xuống 15.' },
  { at: '2026-09-15T07:00:00.000Z', by: 'Trần Minh', target: 'R-011', action: 'Approved & applied', note: 'Ngừng dùng, thay bằng R-007.' }
]

function seed() {
  return {
    rules: seedRules(),
    ddi: SEED_DDI,
    settings: SEED_SETTINGS,
    kb: SEED_KB,
    synonyms: SEED_SYNONYMS,
    required: SEED_REQUIRED,
    audit: SEED_AUDIT
  }
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {/* không lưu được thì chỉ giữ trong phiên */}
}

function load() {
  const saved = read()
  if (!saved?.rules) return seed()
  const base = seed()
  // Lập chỉ mục bị ngắt giữa chừng (đóng app) → đánh dấu cần chạy lại.
  const kb = (saved.kb ?? base.kb).map((d) => (d.status === 'indexing' ? { ...d, status: 'outdated' } : d))
  return { ...base, ...saved, kb, settings: { ...base.settings, ...saved.settings } }
}

let state = load()
const listeners = new Set()
function commit(next) {
  state = next
  write(state)
  listeners.forEach((fn) => fn())
}
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getState = () => state
export function useAIConfig() {
  return useSyncExternalStore(subscribe, getState)
}
export function resetDemo() {
  commit(seed())
}

// Nhật ký riêng của cấu hình AI, ghi song song vào nhật ký chung.
const AUDIT_CODE = {
  'Submitted for review': 'ai.rule_submitted',
  'Approved & applied': 'ai.rule_approved',
  Rejected: 'ai.rule_rejected',
  'Draft saved': 'ai.rule_draft',
  'Withdrawn from review': 'ai.rule_draft',
  'Draft discarded': 'ai.rule_draft',
  'Turned off immediately (safety switch)': 'ai.rule_disabled'
}
function log(s, by, target, action, note = '') {
  const isRule = /^R-\d+$/.test(target ?? '')
  const code = isRule ? AUDIT_CODE[action] ?? 'ai.rule_draft' : /^Interaction pair/.test(action) ? 'ai.ddi' : 'ai.settings'
  const role = code === 'ai.rule_approved' || code === 'ai.rule_rejected' ? 'doctor' : 'admin'
  logEvent({ name: by, roleKey: role }, code, {
    target: { kind: 'ai', id: target, label: target },
    params: { rule: target, item: target, op: action, note }
  })
  return [{ at: now(), by, target, action, note }, ...s.audit].slice(0, 300)
}
function mapRule(id, fn) {
  return state.rules.map((r) => (r.id === id ? fn(r) : r))
}

// Quy tắc: bản nháp → bác sĩ duyệt → áp dụng
export function saveDraft(id, data, note, user, { submit = false, kind } = {}) {
  let ruleId = id
  let rules
  if (!id) {
    const n = Math.max(0, ...state.rules.map((r) => +r.id.slice(2))) + 1
    ruleId = 'R-' + String(n).padStart(3, '0')
    rules = [
      ...state.rules,
      {
        id: ruleId,
        ...data,
        version: 0,
        updatedBy: null,
        updatedAt: null,
        approvedBy: null,
        history: [],
        stats: stats(0, 0, 0),
        pending: { kind: 'create', stage: submit ? 'review' : 'draft', data, by: user.name, byUser: user.username, at: now(), note }
      }
    ]
  } else {
    rules = mapRule(id, (r) => ({
      ...r,
      pending: {
        kind: kind ?? (r.version === 0 ? 'create' : 'edit'),
        stage: submit ? 'review' : 'draft',
        data: { ...pickRuleData(r.pending ? r.pending.data : r), ...data },
        by: user.name,
        byUser: user.username,
        at: now(),
        note
      }
    }))
  }
  let s = { ...state, rules }
  s = { ...s, audit: log(s, user.name, ruleId, submit ? 'Submitted for review' : 'Draft saved', note) }
  commit(s)
  return ruleId
}

// Công tắc an toàn: Quản trị viên tắt ngay luật sai, không cần duyệt; bật lại thì phải gửi bác sĩ duyệt.
// Bản nháp đang có của luật giữ nguyên.
export function disableNow(id, note, user) {
  const r = state.rules.find((x) => x.id === id)
  if (!r || r.version === 0) return { ok: false, error: 'Only live rules can be turned off.' }
  if (!r.enabled) return { ok: false, error: 'This rule is already off.' }
  if (!note || note.trim().length < 5) return { ok: false, error: 'Write the reason (at least 5 characters).' }
  const at = now()
  commit({
    ...state,
    rules: mapRule(id, (x) => ({ ...x, enabled: false, disabled: { by: user.name, at, note: note.trim() }, updatedAt: at })),
    audit: log(state, user.name, id, 'Turned off immediately (safety switch)', note.trim())
  })
  return { ok: true }
}

export function submitForReview(id, user) {
  const r = state.rules.find((x) => x.id === id)
  commit({
    ...state,
    rules: mapRule(id, (x) => ({ ...x, pending: { ...x.pending, stage: 'review', rejected: null } })),
    audit: log(state, user.name, id, 'Submitted for review', r?.pending?.note)
  })
}

export function withdraw(id, user) {
  commit({
    ...state,
    rules: mapRule(id, (x) => ({ ...x, pending: { ...x.pending, stage: 'draft' } })),
    audit: log(state, user.name, id, 'Withdrawn from review')
  })
}

export function discardDraft(id, user) {
  const r = state.rules.find((x) => x.id === id)
  const rules = r.version === 0 ? state.rules.filter((x) => x.id !== id) : mapRule(id, (x) => ({ ...x, pending: null }))
  commit({ ...state, rules, audit: log(state, user.name, id, 'Draft discarded') })
}

export function approve(id, reviewer, comment) {
  const r = state.rules.find((x) => x.id === id)
  if (!r?.pending || r.pending.stage !== 'review') return { ok: false, error: 'This change is not awaiting review.' }
  if (reviewer.roleKey && reviewer.roleKey !== 'doctor') return { ok: false, error: 'Only a doctor can approve or reject knowledge changes.' }
  if (reviewer.username === r.pending.byUser) return { ok: false, error: 'The reviewer must be a different person from the author.' }
  const at = now()
  const applied = {
    ...r,
    ...r.pending.data,
    version: r.version + 1,
    updatedBy: r.pending.by,
    updatedAt: at,
    approvedBy: reviewer.name,
    pending: null,
    history: [
      ...(r.version > 0
        ? [{ version: r.version, at: r.updatedAt, by: r.updatedBy, approvedBy: r.approvedBy, note: r.lastNote ?? '', snap: pickRuleData(r) }]
        : []),
      ...r.history
    ],
    lastNote: r.pending.note
  }
  commit({
    ...state,
    rules: mapRule(id, () => applied),
    audit: log(state, reviewer.name, id, 'Approved & applied', comment || r.pending.note)
  })
  return { ok: true }
}

export function reject(id, reviewer, comment) {
  const r = state.rules.find((x) => x.id === id)
  if (reviewer.roleKey && reviewer.roleKey !== 'doctor') return { ok: false, error: 'Only a doctor can approve or reject knowledge changes.' }
  if (reviewer.username === r?.pending?.byUser) return { ok: false, error: 'The reviewer must be a different person from the author.' }
  commit({
    ...state,
    rules: mapRule(id, (x) => ({ ...x, pending: { ...x.pending, stage: 'draft', rejected: { by: reviewer.name, at: now(), comment } } })),
    audit: log(state, reviewer.name, id, 'Rejected', comment)
  })
  return { ok: true }
}

// Ma trận tương tác thuốc (DDI)
export function upsertDdi(item, user, note) {
  const exists = item.id && state.ddi.some((d) => d.id === item.id)
  let id = item.id
  if (!exists) {
    const n = Math.max(0, ...state.ddi.map((d) => +d.id.slice(2))) + 1
    id = 'D-' + String(n).padStart(3, '0')
  }
  const row = { ...item, id, updatedAt: now(), updatedBy: user.name }
  const ddi = exists ? state.ddi.map((d) => (d.id === id ? row : d)) : [...state.ddi, row]
  commit({ ...state, ddi, audit: log(state, user.name, id, exists ? 'Interaction pair updated' : 'Interaction pair added', note) })
}
export function removeDdi(id, user, note) {
  commit({ ...state, ddi: state.ddi.filter((d) => d.id !== id), audit: log(state, user.name, id, 'Interaction pair removed', note) })
}
export function importDdi(rows, user, fileName) {
  let n = Math.max(0, ...state.ddi.map((d) => +d.id.slice(2)))
  const added = rows.map((r) => ({ ...r, id: 'D-' + String(++n).padStart(3, '0'), updatedAt: now(), updatedBy: user.name }))
  commit({ ...state, ddi: [...state.ddi, ...added], audit: log(state, user.name, fileName, 'Interaction pairs imported', String(added.length)) })
}

export function updateSettings(patch, user, note) {
  commit({ ...state, settings: { ...state.settings, ...patch }, audit: log(state, user.name, 'AI module', 'Module settings changed', note) })
}

export function setDocStatus(id, status) {
  commit({
    ...state,
    kb: state.kb.map((d) => (d.id === id ? { ...d, status, ...(status === 'indexed' ? { updatedAt: now() } : {}) } : d))
  })
}
export function logKb(user, target) {
  commit({ ...state, audit: log(state, user.name, target, 'Knowledge base re-indexed') })
}
export function setSynonyms(key, list, user) {
  commit({ ...state, synonyms: { ...state.synonyms, [key]: list }, audit: log(state, user.name, key, 'Synonyms updated', list.join(', ')) })
}
export function updateRequired(key, patch, user) {
  commit({
    ...state,
    required: state.required.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    audit: log(state, user.name, key, 'Required field updated')
  })
}
