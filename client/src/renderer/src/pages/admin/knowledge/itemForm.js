import { translate } from '../../../i18n'
import { SLUG_RE, KEY_MAX, RULE_PREFIX } from '../../../api/knowledgeApi'
import { cleanLogic, logicProblem } from './logic'
import { fold } from '../../../utils/format'

// Giới hạn giống server (knowledge_validators): tên ngắn ≤ 30 ký tự, tối đa 15 từ đồng nghĩa, mỗi từ ≤ 60 ký tự.
export const SHORT_NAME_MAX = 30
export const ALIAS_MAX = 60
export const ALIASES_MAX = 15
export const DETECTIONS = [
  ['both', 'Both'],
  ['reported', 'Reported by patient'],
  ['exam', 'Found on examination']
]
// Mỗi dòng một từ đồng nghĩa; bỏ dòng trống và khoảng trắng thừa.
export const aliasList = (text) =>
  String(text ?? '')
    .split('\n')
    .map((x) => x.trim().replace(/\s+/g, ' '))
    .filter(Boolean)

// Sửa = nội dung bản mới nhất còn hiệu lực (nháp hoặc đang dùng); thêm = trống.
export function initial(kind, base, sources) {
  const v = base?.values ?? {}
  const src = v.source_id ?? sources[0]?.source_id ?? ''
  switch (kind) {
    case 'symptoms':
      return { symptom_name: v.symptom_name ?? '', short_name: v.short_name ?? '', aliases: (v.aliases ?? []).join('\n'), detection: v.detection ?? 'both', category: v.category ?? '' }
    case 'conditions':
      return { name_vi: v.name_vi ?? '', icd10_code: v.icd10_code ?? '', disease_group: v.disease_group ?? '', description: v.description ?? '' }
    case 'relations':
      return { condition_code: v.condition_code ?? '', symptom_code: v.symptom_code ?? '', polarity: v.polarity ?? 'SUPPORTS', weight: v.weight ?? 0.5, is_key: !!v.is_key, source_id: src }
    case 'excerpts':
      return { condition_code: v.condition_code ?? '', title: v.title ?? '', content: v.content ?? '', source_id: src, source_locator: v.source_locator ?? '' }
    default:
      return {
        rule_name: v.rule_name ?? '',
        rule_type: v.rule_type ?? 'RED_FLAG',
        reason_text: v.reason_text ?? '',
        condition_logic: v.condition_logic ?? { op: 'AND', args: [] },
        source_id: src
      }
  }
}

const opt = (s) => (s?.trim() ? s.trim() : null)

// Đúng schema của server: bỏ trống → null, số → số.
export function bodyOf(kind, f) {
  switch (kind) {
    case 'symptoms':
      return { symptom_name: f.symptom_name.trim(), short_name: opt(f.short_name), aliases: aliasList(f.aliases), detection: f.detection, category: opt(f.category) }
    case 'conditions':
      return { name_vi: f.name_vi.trim(), icd10_code: opt(f.icd10_code), disease_group: opt(f.disease_group), description: opt(f.description) }
    case 'relations':
      return { polarity: f.polarity, weight: Number(f.weight), is_key: f.is_key, source_id: f.source_id }
    case 'excerpts':
      return { condition_code: f.condition_code, title: f.title.trim(), content: f.content.trim(), source_id: f.source_id, source_locator: opt(f.source_locator) }
    default:
      return { rule_name: f.rule_name.trim(), rule_type: f.rule_type, reason_text: f.reason_text.trim(), condition_logic: cleanLogic(f.condition_logic), source_id: f.source_id }
  }
}

export function problem(kind, key, f, creating) {
  if (creating && kind !== 'relations') {
    if (!SLUG_RE.test(key)) return translate('Code: lowercase letters without accents, digits and underscores between words')
    if (key.length > KEY_MAX[kind]) return translate('Code is too long')
    if (kind === 'rules' && !key.startsWith(RULE_PREFIX[f.rule_type]))
      return translate('Rule code must start with') + ' ' + RULE_PREFIX[f.rule_type]
  }
  if (kind === 'symptoms') {
    if (!f.symptom_name.trim()) return translate('Enter the symptom name')
    if (f.short_name.trim().length > SHORT_NAME_MAX) return translate('Short name is at most 30 characters')
    const aliases = aliasList(f.aliases)
    if (aliases.length > ALIASES_MAX) return translate('At most 15 synonyms')
    const long = aliases.find((a) => a.length > ALIAS_MAX)
    if (long) return translate('Each synonym is at most 60 characters') + ' — ' + long
    const seen = new Set()
    for (const a of aliases) {
      const k = fold(a)
      if (seen.has(k)) return translate('Duplicate synonym') + ': ' + a
      seen.add(k)
    }
  }
  if (kind === 'conditions' && !f.name_vi.trim()) return translate('Enter the condition name')
  if (kind === 'relations') {
    if (!f.condition_code || !f.symptom_code) return translate('Choose a condition and a symptom')
    const w = Number(f.weight)
    if (!(w >= 0 && w <= 1)) return translate('Weight must be between 0 and 1')
  }
  if (kind === 'excerpts' && (!f.condition_code || !f.title.trim() || !f.content.trim())) return translate('Fill in the condition, title and content')
  if (kind === 'rules') {
    if (!f.rule_name.trim() || !f.reason_text.trim()) return translate('Fill in the rule name and the reason shown to doctors')
    const p = logicProblem(f.condition_logic)
    if (p) return p
  }
  if (['relations', 'excerpts', 'rules'].includes(kind) && !f.source_id) return translate('Choose a source')
  return null
}
