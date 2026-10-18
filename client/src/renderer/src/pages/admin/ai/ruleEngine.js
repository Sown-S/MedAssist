// Bộ máy chạy quy tắc cứng (rule-based) — cũng chính là chế độ dự phòng khi mô hình ngôn ngữ ngừng chạy.
// Chạy hoàn toàn ở máy, không cần mạng.
import { SYMPTOMS, ICD10 } from './catalog'

// Nội dung "đang có hiệu lực" của quy tắc, hoặc nội dung bản nháp nếu đang có thay đổi chờ duyệt.
export const effective = (rule) => (rule.pending ? { ...rule, ...rule.pending.data } : rule)
export const isLive = (rule) => rule.version > 0 && rule.enabled && !rule.retired

// ---------- Khoảng giá trị (dùng chung cho tuổi, số ngày, sinh hiệu) ----------
const FULL = { lo: -Infinity, loIn: true, hi: Infinity, hiIn: true }
function fromOp(op, value) {
  const v = +value
  if (op === '>') return { ...FULL, lo: v, loIn: false }
  if (op === '>=') return { ...FULL, lo: v, loIn: true }
  if (op === '<') return { ...FULL, hi: v, hiIn: false }
  return { ...FULL, hi: v, hiIn: true }
}
function intersect(a, b) {
  const lo = Math.max(a.lo, b.lo)
  const hi = Math.min(a.hi, b.hi)
  const loIn = a.lo === b.lo ? a.loIn && b.loIn : a.lo > b.lo ? a.loIn : b.loIn
  const hiIn = a.hi === b.hi ? a.hiIn && b.hiIn : a.hi < b.hi ? a.hiIn : b.hiIn
  return { lo, hi, loIn, hiIn }
}
const nonEmpty = (r) => r.lo < r.hi || (r.lo === r.hi && r.loIn && r.hiIn)
const sameRange = (a, b) => a.lo === b.lo && a.hi === b.hi && a.loIn === b.loIn && a.hiIn === b.hiIn

function vitalRanges(cond) {
  const m = {}
  for (const v of cond.vitals ?? []) m[v.key] = intersect(m[v.key] ?? FULL, fromOp(v.op, v.value))
  return m
}
function ageRange(cond) {
  return {
    lo: cond.ageMin ?? -Infinity,
    loIn: true,
    hi: cond.ageMax ?? Infinity,
    hiIn: true
  }
}
const dayRange = (cond) => ({ ...FULL, lo: cond.minDays ?? -Infinity })

// ---------- Chạy 1 ca ----------
// ca = { age, days, symptoms: Set, states?, vitals: { temp, hr, ... } } — trường bỏ trống = null.
// states (logic BA TRỊ, dùng ở tiếp đón / đánh giá thật): { mã: 'PRESENT' | 'ABSENT' | 'UNKNOWN' }, mã không có = UNKNOWN.
//   - luật cần triệu chứng CÓ: PRESENT → khớp, ABSENT → không khớp, UNKNOWN → còn thiếu (cần hỏi);
//   - luật cần triệu chứng KHÔNG: ngược lại.
// Không có states (bản thử luật trên câu tự do): triệu chứng không nhắc tới = không có (như trước).
// Trả về: ok (khớp đủ), partial (đã có bằng chứng nhưng còn thiếu thông tin để kết luận), hits, missing.
// Mã triệu chứng còn thiếu ghi dạng 'sym:<mã>'.
export function matchRule(rule, c) {
  const cond = rule.cond
  const hits = []
  const missing = []
  const missingSym = []
  const stateOf = (s) => (c.states ? c.states[s] ?? 'UNKNOWN' : c.symptoms.has(s) ? 'PRESENT' : 'ABSENT')
  for (const s of cond.symptoms) {
    const st = stateOf(s)
    if (st === 'ABSENT') return { ok: false }
    if (st === 'UNKNOWN') missingSym.push('sym:' + s)
    else hits.push({ kind: 'symptom', key: s })
  }
  for (const s of cond.absent ?? []) {
    const st = stateOf(s)
    if (st === 'PRESENT') return { ok: false }
    if (st === 'UNKNOWN') missingSym.push('sym:' + s)
    else hits.push({ kind: 'absent', key: s })
  }
  if (cond.ageMin != null || cond.ageMax != null) {
    if (c.age == null) missing.push('age')
    else if ((cond.ageMin != null && c.age < cond.ageMin) || (cond.ageMax != null && c.age > cond.ageMax)) return { ok: false }
    else hits.push({ kind: 'age' })
  }
  if (cond.minDays != null) {
    if (c.days == null) missing.push('days')
    else if (c.days < cond.minDays) return { ok: false }
    else hits.push({ kind: 'days' })
  }
  for (const v of cond.vitals ?? []) {
    const val = c.vitals[v.key]
    if (val == null) {
      missing.push(v.key)
      continue
    }
    const r = fromOp(v.op, v.value)
    const pass = (val > r.lo || (val === r.lo && r.loIn)) && (val < r.hi || (val === r.hi && r.hiIn))
    if (!pass) return { ok: false }
    hits.push({ kind: 'vital', key: v.key, value: val })
  }
  // Triệu chứng chưa rõ chỉ tính là "cần hỏi" khi luật đã có ít nhất một bằng chứng — tránh liệt kê mọi luật lúc form còn trống.
  const all = [...missing, ...(missingSym.length && (hits.length || missing.length) ? missingSym : [])]
  const unresolved = missing.length + missingSym.length
  return { ok: unresolved === 0, partial: all.length > 0, hits, missing: all }
}

// Áp dụng cấu hình module: cờ đỏ / ưu tiên luôn hiện; gợi ý chẩn đoán lọc theo ngưỡng tin cậy + số gợi ý tối đa.
export function evaluateCase(rules, c, settings, { includeDrafts = false } = {}) {
  const pool = rules
    .map((r) => (includeDrafts && r.pending ? effective(r) : r))
    .filter((r) => (includeDrafts ? r.enabled && !r.retired : isLive(r)))
  const fired = []
  const incomplete = []
  for (const r of pool) {
    const m = matchRule(r, c)
    if (m.ok) fired.push({ rule: r, hits: m.hits })
    else if (m.partial) incomplete.push({ rule: r, missing: m.missing })
  }
  fired.sort((a, b) => b.rule.weight - a.rule.weight)
  const alerts = fired.filter((f) => f.rule.type !== 'dx')
  const dxAll = fired.filter((f) => f.rule.type === 'dx')
  const dxShown = dxAll.filter((f) => f.rule.weight >= settings.minConfidence).slice(0, settings.maxSuggestions)
  const dxHidden = dxAll.filter((f) => !dxShown.includes(f))
  return { alerts, dxShown, dxHidden, incomplete }
}

// ---------- Phát hiện trùng / mâu thuẫn ----------
// - duplicate: điều kiện giống hệt và cùng kết quả → 1 trong 2 thừa.
// - conflict: điều kiện giống hệt nhưng kết quả (mã ICD / loại) khác nhau → hệ thống không biết tin cái nào.
// - overlap: điều kiện của quy tắc này nằm gọn trong quy tắc kia, khác mã ICD → luôn kích hoạt cùng lúc.
function sameSet(a = [], b = []) {
  return a.length === b.length && a.every((x) => b.includes(x))
}
function subset(a = [], b = []) {
  return a.every((x) => b.includes(x))
}
function sameConditions(a, b) {
  if (!sameSet(a.symptoms, b.symptoms) || !sameSet(a.absent, b.absent)) return false
  if (!sameRange(ageRange(a), ageRange(b)) || !sameRange(dayRange(a), dayRange(b))) return false
  const va = vitalRanges(a)
  const vb = vitalRanges(b)
  const keys = new Set([...Object.keys(va), ...Object.keys(vb)])
  return [...keys].every((k) => va[k] && vb[k] && sameRange(va[k], vb[k]))
}
// Có tồn tại 1 ca thoả cả 2 quy tắc không?
function canCoFire(a, b) {
  if (a.symptoms.some((s) => (b.absent ?? []).includes(s)) || b.symptoms.some((s) => (a.absent ?? []).includes(s))) return false
  if (!nonEmpty(intersect(ageRange(a), ageRange(b)))) return false
  const va = vitalRanges(a)
  const vb = vitalRanges(b)
  return Object.keys(va).every((k) => !vb[k] || nonEmpty(intersect(va[k], vb[k])))
}

export function findIssues(candidate, rules) {
  const out = []
  const a = effective(candidate)
  for (const other of rules) {
    if (other.id === candidate.id) continue
    const b = effective(other)
    if (b.retired) continue
    if (sameConditions(a.cond, b.cond)) {
      const same = a.type === b.type && a.icd === b.icd
      out.push({ kind: same ? 'duplicate' : 'conflict', with: other })
    } else if (
      a.type === 'dx' &&
      b.type === 'dx' &&
      a.icd !== b.icd &&
      (subset(a.cond.symptoms, b.cond.symptoms) || subset(b.cond.symptoms, a.cond.symptoms)) &&
      canCoFire(a.cond, b.cond)
    ) {
      out.push({ kind: 'overlap', with: other })
    }
  }
  return out
}

// Danh sách cặp có vấn đề trên toàn bộ quy tắc (mỗi cặp 1 lần).
export function allIssues(rules) {
  const seen = new Set()
  const list = []
  const active = rules.filter((r) => !effective(r).retired)
  for (const r of active) {
    for (const issue of findIssues(r, active)) {
      const k = [r.id, issue.with.id].sort().join('|')
      if (seen.has(k)) continue
      seen.add(k)
      list.push({ ...issue, rule: r })
    }
  }
  return list
}

// ---------- Trích xuất từ câu tự do tiếng Việt (bản đơn giản, dựa trên từ điển đồng nghĩa) ----------
const lower = (s) => s.toLowerCase().normalize('NFC')
export function extractCase(text, synonyms) {
  const t = lower(text)
  const symptoms = new Set()
  const found = []
  const negated = []
  // Lần xuất hiện có "không / chưa / hết / ko" đứng ngay trước (VD "không sốt") được coi là phủ định.
  const occurs = (p) => {
    const out = []
    for (let i = t.indexOf(p); i >= 0; i = t.indexOf(p, i + 1)) out.push(/(?:không|chưa|hết|ko)\s*$/.test(t.slice(Math.max(0, i - 8), i)))
    return out
  }
  for (const s of SYMPTOMS) {
    const hits = (synonyms[s.key] ?? []).map((p) => ({ p, occ: p ? occurs(lower(p)) : [] })).filter((h) => h.occ.length)
    if (!hits.length) continue
    const positive = hits.filter((h) => h.occ.includes(false))
    if (positive.length) {
      symptoms.add(s.key)
      found.push({ key: s.key, phrase: positive.map((h) => h.p).sort((x, y) => y.length - x.length)[0] })
    } else negated.push(s.key)
  }
  const num = (re) => {
    const m = t.match(re)
    return m ? parseFloat(m[1].replace(',', '.')) : null
  }
  const age = num(/(\d{1,3})\s*tuổi/)
  const temp = num(/(\d{2}(?:[.,]\d)?)\s*(?:độ|°)/)
  const spo2 = num(/spo2\s*[:=]?\s*(\d{2,3})/)
  const weeks = num(/(\d{1,2})\s*tuần/)
  const dayN = num(/(\d{1,3})\s*ngày/)
  const days = dayN ?? (weeks != null ? weeks * 7 : null)
  if (temp != null && temp >= 37.5) symptoms.add('fever')
  return { symptoms, found, negated, age, days, vitals: { temp, spo2 } }
}

export const icdCodes = ICD10.map((i) => i.code)

// ---------- Hiệu quả ----------
export function prf({ tp = 0, fp = 0, fn = 0 }) {
  const precision = tp + fp ? tp / (tp + fp) : NaN
  const recall = tp + fn ? tp / (tp + fn) : NaN
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : NaN
  return { precision, recall, f1 }
}
