// Kết quả AI giả lập cho bản demo, đúng schema AssessmentOut (GET /visits/{id}/assessment) để thẻ gợi ý dùng chung hai chế độ.
// ai_status: Skipped = ca cờ đỏ, dừng ở Node 1 · Pending = chưa có kết quả · Preliminary = đã có xếp hạng tất định,
// LLM đang chạy · Ready = LLM đã xếp hạng và giải thích · Degraded = LLM lỗi hoặc tắt, chỉ còn xếp hạng tất định · Failed = lỗi hệ thống.
// Đầu vào như backend: triệu chứng đã xác nhận, sinh hiệu, tuổi lúc tiếp đón.
// Thử trạng thái Degraded: đặt localStorage medassist_mock_llm_down = '1'.
import { evaluateCase, extractCase, isLive } from '../pages/admin/ai/ruleEngine'
import { SYMPTOMS, icdLabel } from '../pages/admin/ai/catalog'
import { VI } from '../i18n/vi'
import { ruleVitals } from './vitals'
import { statesOf } from './symptoms'
import { missingLabel } from './triage'

// Backend trả tên tiếng Việt; dữ liệu mẫu viết bằng tiếng Anh nên tra bảng dịch.
const vi = (label) => VI[label] ?? label
const symptomOut = (k) => ({ symptom_code: k, symptom_name: vi(SYMPTOMS.find((s) => s.key === k)?.label ?? k) })
// condition_code là slug theo tên bệnh (vd “viem_hong_cap”), không phải mã ICD.
const slugOf = (name) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
// 'sym:<mã>' là triệu chứng; còn lại là tuổi / thời gian bệnh / sinh hiệu.
const missingOut = (k) => ({ symptom_code: k.startsWith('sym:') ? k.slice(4) : k, symptom_name: vi(missingLabel(k)) })
const ALERT_TYPE = { redflag: 'RED_FLAG', priority: 'PRIORITY_FLOOR' }

function caseOf(visit, synonyms) {
  const confirmed = visit.symptoms?.length ? statesOf(visit.symptoms) : null
  // Dữ liệu mẫu cũ chưa có triệu chứng có cấu trúc → suy tạm từ lý do khám.
  const ex = confirmed ? null : extractCase(VI[visit.reason] ?? visit.reason ?? '', synonyms)
  const states = confirmed ?? Object.fromEntries([...ex.symptoms].map((k) => [k, 'PRESENT']).concat(ex.negated.map((k) => [k, 'ABSENT'])))
  return {
    age: visit.age === '' || visit.age == null ? null : Number(visit.age),
    days: visit.days ?? ex?.days ?? null,
    symptoms: new Set(Object.entries(states).filter(([, st]) => st === 'PRESENT').map(([k]) => k)),
    states,
    vitals: ruleVitals(visit.vitals)
  }
}

// Mô phỏng Node 2: chấm điểm từng bệnh theo mức phủ triệu chứng.
function rank(rules, c, settings) {
  const st = (k) => c.states[k] ?? 'UNKNOWN'
  const out = []
  for (const r of rules.filter((x) => x.type === 'dx' && isLive(x))) {
    const want = r.cond.symptoms ?? []
    const supporting = want.filter((s) => st(s) === 'PRESENT')
    if (!supporting.length) continue
    const contradicting = [...want.filter((s) => st(s) === 'ABSENT'), ...(r.cond.absent ?? []).filter((s) => st(s) === 'PRESENT')]
    const missing = [...want, ...(r.cond.absent ?? [])].filter((s) => st(s) === 'UNKNOWN')
    const score = Math.min(1, Math.max(0, r.weight * (supporting.length / want.length) - 0.25 * contradicting.length))
    const weight = Math.round((1 / want.length) * 100) / 100
    const evidence = (k) => ({ ...symptomOut(k), weight, is_key: want.includes(k) })
    const name = vi(icdLabel(r.icd))
    out.push({
      condition_code: slugOf(name),
      name_vi: name,
      icd10_code: r.icd || null,
      score: Math.round(score * 100) / 100,
      supporting: supporting.map(evidence),
      contradicting: contradicting.map(evidence),
      missing: missing.map(symptomOut),
      explanation: r.rationale || null,
      label: 'Reference Suggestion'
    })
  }
  return out
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(3, settings.maxSuggestions ?? 3))
    .map((x, i) => ({ rank: i + 1, ...x }))
}

export function mockAssessment(visit, ai, now = Date.now()) {
  const c = caseOf(visit, ai.synonyms ?? {})
  const res = evaluateCase(ai.rules, c, ai.settings)
  const fired = res.alerts.filter((f) => ALERT_TYPE[f.rule.type]) // Node 1 luôn chạy, kể cả khi tắt module AI
  const red = visit.triage === 'emergency' || fired.some((f) => f.rule.type === 'redflag')
  const level = red ? 'Emergency' : fired.some((f) => f.rule.type === 'priority') || visit.priority ? 'HighPriority' : 'Routine'
  const base = {
    assessment_id: 'AS-' + visit.id,
    knowledge_release: 'KB-2026.01',
    model_version: ai.settings.model,
    prompt_version: 'rank-v1',
    priority: { rule: level, final: level, raised_by_ai: false },
    alerts: fired.map((f) => ({ rule_key: f.rule.id, rule_type: ALERT_TYPE[f.rule.type], reason_text: f.rule.rationale ?? '' })),
    complete_now: [...new Set(res.incomplete.flatMap((x) => x.missing))].map(missingOut)
  }
  // Cờ đỏ: dừng ở Node 1, không gợi ý chẩn đoán (FR08).
  if (red) return { ...base, ai_status: 'Skipped', mode: 'RuleOnly', candidates: [] }
  const candidates = rank(ai.rules, c, ai.settings)
  const ruleOnly = candidates.map((x) => ({ ...x, explanation: null }))
  if (!ai.settings.enabled) return { ...base, ai_status: 'Degraded', mode: 'RuleOnly', candidates: ruleOnly }
  const elapsed = (now - new Date(visit.arrivedAt ?? now).getTime()) / 1000
  if (elapsed < 5) return { ...base, ai_status: 'Pending', mode: null, candidates: [] }
  if (elapsed < 12) return { ...base, ai_status: 'Preliminary', mode: 'RuleOnly', candidates: ruleOnly }
  let llmDown = false
  try {
    llmDown = localStorage.getItem('medassist_mock_llm_down') === '1'
  } catch {
    /* bỏ qua */
  }
  if (llmDown) return { ...base, ai_status: 'Degraded', mode: 'RuleOnly', candidates: ruleOnly }
  return { ...base, ai_status: 'Ready', mode: 'Full', candidates }
}
