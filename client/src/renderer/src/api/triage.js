// Phân loại lúc tiếp đón (Node 1 — cổng cờ đỏ + mức sàn ưu tiên, luật tất định, KHÔNG dùng LLM) theo logic ba trị.
// Đầu vào CHỈ gồm dữ liệu đã xác nhận: trạng thái triệu chứng (PRESENT / ABSENT / UNKNOWN), sinh hiệu 8 khoá, tuổi.
// Mô tả tự do KHÔNG được đọc trực tiếp — phải qua bước trích xuất + lễ tân xác nhận (Architecture 5.1.2).
//  - luật cờ đỏ khớp đủ           → CẤP CỨU (Emergency);
//  - luật mức sàn khớp đủ          → ƯU TIÊN (High Priority);
//  - luật cờ đỏ còn thiếu dữ liệu  → "cần đo / hỏi ngay" (không bỏ qua);
//  - không khớp gì                 → THƯỜNG (Routine).
// Luôn chạy, kể cả khi tắt module AI (FR08).
// Backend thật: POST /visits/{id}/assessment trả priority + is_red_flag + rule hits trong < 2 giây (Architecture 5.1.3).
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

// Nhãn của 1 mục còn thiếu: 'age' | 'days' | 'sym:<mã>' | khoá sinh hiệu ngắn (temp, hr…).
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
