// GIẢ LẬP kết quả đánh giá AI của một lượt khám — đúng cấu trúc dự kiến của GET /api/v1/visits/{id}/assessment
// (Architecture 5.1.4) để thẻ gợi ý ở màn bác sĩ không phải sửa khi Huy và Sơn xong API:
// {
//   assessment_id, ai_status: 'Pending' | 'Ready' | 'Degraded' | 'Skipped',
//   mode: 'Full' | 'RuleOnly', knowledge_release, model_version, prompt_version,
//   candidates: [{ condition_code, icd10, name, score, supporting: [], contradicting: [], missing: [], explanation, rule_id, rule_version }],
//   missing: [], alerts: [...]   // alerts = luật cờ đỏ / ưu tiên đã khớp (Node 1)
// }
//  - Skipped : ca cờ đỏ — pipeline dừng ở Node 1, KHÔNG gợi ý chẩn đoán;
//  - Pending : Node 2-4 đang chạy nền (tối đa 90 s);
//  - Ready   : LLM xếp hạng + giải thích trong danh sách đóng, đã qua kiểm tra (mode Full);
//  - Degraded: LLM lỗi / quá hạn / sai định dạng, hoặc module AI đang tắt → chỉ còn xếp hạng tất định của Node 2 (mode RuleOnly).
// Đầu vào giống backend: triệu chứng ĐÃ XÁC NHẬN + sinh hiệu + tuổi lúc tiếp đón (không dùng ghi chép của bác sĩ).
// Đặt localStorage medassist_mock_llm_down = '1' để thử trạng thái "Degraded".
import { evaluateCase, extractCase, isLive } from '../pages/admin/ai/ruleEngine'
import { SYMPTOMS, icdLabel } from '../pages/admin/ai/catalog'
import { VI } from '../i18n/vi'
import { ruleVitals } from './vitals'
import { statesOf } from './symptoms'
import { missingLabel } from './triage'

const symLabel = (k) => SYMPTOMS.find((s) => s.key === k)?.label ?? k

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
    const score = Math.max(0, r.weight * (supporting.length / want.length) - 0.25 * contradicting.length)
    out.push({
      condition_code: r.icd,
      icd10: r.icd,
      name: icdLabel(r.icd),
      score: Math.round(score * 100) / 100,
      supporting: supporting.map(symLabel),
      contradicting: contradicting.map(symLabel),
      missing: missing.map(symLabel),
      explanation: r.rationale,
      rule_id: r.id,
      rule_version: r.version
    })
  }
  return out
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(3, settings.maxSuggestions ?? 3))
}

export function mockAssessment(visit, ai, now = Date.now()) {
  const c = caseOf(visit, ai.synonyms ?? {})
  const res = evaluateCase(ai.rules, c, ai.settings)
  const alerts = res.alerts // Node 1 luôn chạy, kể cả khi tắt module AI
  const base = {
    assessment_id: 'AS-' + visit.id,
    knowledge_release: 'KB-2026.01',
    model_version: ai.settings.model,
    prompt_version: 'rank-v1',
    alerts,
    missing: [...new Set(res.incomplete.flatMap((x) => x.missing))].map(missingLabel)
  }
  // Cờ đỏ: pipeline dừng ở Node 1 — không gợi ý chẩn đoán (FR08).
  if (visit.triage === 'emergency' || alerts.some((f) => f.rule.type === 'redflag')) return { ...base, ai_status: 'Skipped', mode: 'RuleOnly', candidates: [] }
  const candidates = rank(ai.rules, c, ai.settings)
  if (!ai.settings.enabled) return { ...base, ai_status: 'Degraded', mode: 'RuleOnly', reason: 'off', candidates: candidates.map((x) => ({ ...x, explanation: '' })) }
  const elapsed = (now - new Date(visit.arrivedAt ?? now).getTime()) / 1000
  if (elapsed < 12) return { ...base, ai_status: 'Pending', mode: 'RuleOnly', candidates: [] }
  let llmDown = false
  try {
    llmDown = localStorage.getItem('medassist_mock_llm_down') === '1'
  } catch {
    /* bỏ qua */
  }
  if (llmDown) return { ...base, ai_status: 'Degraded', mode: 'RuleOnly', reason: 'llm', candidates: candidates.map((x) => ({ ...x, explanation: '' })) }
  return { ...base, ai_status: 'Ready', mode: 'Full', candidates }
}
