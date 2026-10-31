// GIẢ LẬP kết quả đánh giá AI của một lượt khám — đúng schema AssessmentOut của GET /api/v1/visits/{id}/assessment
// (server/app/schemas/assessment.py) để thẻ gợi ý ở màn bác sĩ không phải sửa khi chuyển sang API thật:
// {
//   assessment_id, ai_status: 'Pending' | 'Preliminary' | 'Ready' | 'Degraded' | 'Failed' | 'Skipped',
//   mode: 'Full' | 'RuleOnly' | null, knowledge_release, model_version, prompt_version,
//   priority: { rule, final, raised_by_ai },              // 'Routine' | 'HighPriority' | 'Emergency'
//   alerts: [{ rule_key, rule_type: 'RED_FLAG' | 'PRIORITY_FLOOR', reason_text }],   // luật cờ đỏ / ưu tiên đã khớp (Node 1)
//   complete_now: [{ symptom_code, symptom_name }],       // thông tin nên hỏi / đo thêm
//   candidates: [{ rank, condition_code (slug), name_vi, icd10_code, score,
//                  supporting: [{ symptom_code, symptom_name, weight, is_key }], contradicting: [...],
//                  missing: [{ symptom_code, symptom_name }], explanation, label: 'Reference Suggestion' }]
// }
//  - Skipped    : ca cờ đỏ — pipeline dừng ở Node 1, KHÔNG gợi ý chẩn đoán;
//  - Pending    : vừa gửi, chưa có kết quả;
//  - Preliminary: đã có xếp hạng tất định của Node 2, LLM đang chạy nền (tối đa 90 s);
//  - Ready      : LLM xếp hạng + giải thích trong danh sách đóng, đã qua kiểm tra (mode Full);
//  - Degraded   : LLM lỗi / quá hạn / sai định dạng, hoặc module AI đang tắt → chỉ còn xếp hạng tất định (mode RuleOnly);
//  - Failed     : lỗi hệ thống, không có kết quả.
// Đầu vào giống backend: triệu chứng ĐÃ XÁC NHẬN + sinh hiệu + tuổi lúc tiếp đón (không dùng ghi chép của bác sĩ).
// Đặt localStorage medassist_mock_llm_down = '1' để thử trạng thái "Degraded".
import { evaluateCase, extractCase, isLive } from '../pages/admin/ai/ruleEngine'
import { SYMPTOMS, icdLabel } from '../pages/admin/ai/catalog'
import { VI } from '../i18n/vi'
import { ruleVitals } from './vitals'
import { statesOf } from './symptoms'
import { missingLabel } from './triage'

// Backend trả tên tiếng Việt; dữ liệu mẫu viết bằng tiếng Anh nên tra bảng dịch.
const vi = (label) => VI[label] ?? label
const symptomOut = (k) => ({ symptom_code: k, symptom_name: vi(SYMPTOMS.find((s) => s.key === k)?.label ?? k) })
// condition_code là mã slug theo tên bệnh (vd "viem_hong_cap"), không phải mã ICD.
const slugOf = (name) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
// Mục còn thiếu của luật: 'sym:<mã>' là triệu chứng, còn lại là tuổi / thời gian bệnh / sinh hiệu.
const missingOut = (k) => ({ symptom_code: k.startsWith('sym:') ? k.slice(4) : k, symptom_name: vi(missingLabel(k)) })
const ALERT_TYPE = { redflag: 'RED_FLAG', priority: 'PRIORITY_FLOOR' }

function caseOf(visit, synonyms) {
  const confirmed = visit.symptoms?.length ? statesOf(visit.symptoms) : null
  // Dữ liệu mẫu cũ chưa có triệu chứng có cấu trúc → tạm suy từ lý do khám (chỉ để bản demo có gợi ý).
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

// Node 2 mô phỏng: chấm điểm từng bệnh trong danh sách đóng (luật chẩn đoán đang Active) theo mức phủ triệu chứng (ba trị).
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
  // Cờ đỏ: pipeline dừng ở Node 1 — không gợi ý chẩn đoán (FR08).
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
