// Phân loại lúc tiếp đón (Node 1): luật tất định, không dùng LLM, logic ba trị. Chỉ đọc dữ liệu đã xác nhận
// (triệu chứng, sinh hiệu, tuổi) — không đọc thẳng lời kể. Cờ đỏ khớp → Cấp cứu; mức sàn khớp → Ưu tiên;
// luật cờ đỏ còn thiếu dữ liệu → “cần đo / hỏi ngay”. Luôn chạy, kể cả khi tắt module AI (FR08).
import { getState } from './aiConfigStore'
import { evaluateCase } from '../pages/admin/ai/ruleEngine'
import { vitalOf } from '../pages/admin/ai/catalog'
import { symptomName } from './symptoms'
import { ruleVitals } from './vitals'

export const TRIAGE_LEVELS = {
  emergency: { label: 'Emergency', tone: 'low' },
  high: { label: 'High priority', tone: 'warn' },
  routine: { label: 'Routine', tone: 'muted' }
}

// 'age' | 'days' | 'sym:<mã>' | khoá sinh hiệu ngắn (temp, hr…)
export const missingLabel = (k) =>
  k === 'age' ? 'Age' : k === 'days' ? 'Symptom duration' : k.startsWith('sym:') ? symptomName(k.slice(4)) : vitalOf(k)?.label ?? k

export function triage({ states = {}, age = null, days = null, vitals = {} }) {
  const ai = getState()
  const kase = {
    age: age === '' || age == null ? null : Number(age),
    days: days === '' || days == null ? null : Number(days),
    symptoms: new Set(Object.entries(states).filter(([, s]) => s === 'PRESENT').map(([k]) => k)),
    states,
    vitals: ruleVitals(vitals)
  }
  const res = evaluateCase(ai.rules, kase, ai.settings)
  const red = res.alerts.filter((f) => f.rule.type === 'redflag')
  const high = res.alerts.filter((f) => f.rule.type === 'priority')
  const needNow = [...new Set(res.incomplete.filter((x) => x.rule.type === 'redflag').flatMap((x) => x.missing))]
  return { level: red.length ? 'emergency' : high.length ? 'high' : 'routine', red, high, needNow }
}
