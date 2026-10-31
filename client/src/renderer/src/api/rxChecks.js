// Kiểm tra đơn lúc kê theo danh mục tương tác bác sĩ đã duyệt (dị ứng chéo, thuốc–thuốc, cùng nhóm, thuốc–bệnh nền,
// giới hạn liều). Mức độ quyết định hành vi: contraindicated = chặn chốt đơn, severe = phải ghi lý do, warning = chỉ nhắc.
import { getState } from './aiConfigStore'
import { findDrugByName, getInventory } from './inventoryStore'
import { fold } from './patientStore'

const RANK = { contraindicated: 0, severe: 1, warning: 2 }
// Bệnh nền trong hồ sơ có thể ghi bằng tiếng Anh hoặc tiếng Việt.
const CONDITION_WORDS = {
  'chronic kidney disease': ['chronic kidney', 'kidney disease', 'suy than', 'benh than man'],
  asthma: ['asthma', 'hen'],
  'peptic ulcer': ['peptic ulcer', 'loet da day']
}

const drugText = (d) => fold([d.name, d.ingredient].join(' '))
// Khớp theo mã ATC (cả nhóm, VD M01A) hoặc theo tên hoạt chất.
function matches(name, atc, d) {
  if (!d) return false
  if (atc && d.atc && d.atc.startsWith(atc)) return true
  const word = fold(name).split(' ')[0]
  return word.length > 3 && !word.includes('(') && drugText(d).includes(word)
}
// “Warfarin (B01AA03)” → { name: 'Warfarin', atc: 'B01AA03' }
function partner(b) {
  const atc = b.match(/\(([A-Z0-9]+)\)/)?.[1] ?? ''
  return { name: b.replace(/\s*\(.*\)\s*/, '').trim(), atc }
}

export function checkRx(items, patient) {
  const drugs = getInventory().drugs
  const lines = items.map((it) => ({ it, d: findDrugByName(it.name, drugs) })).filter((x) => x.d)
  const allergies = fold(patient?.allergies)
  const history = fold(patient?.history)
  const adult = !(Number(patient?.age) < 16)
  const out = []

  for (const { d } of lines)
    for (const a of allergies.split(/[,;]/).map((s) => s.trim()).filter((s) => s.length > 3))
      if (drugText(d).includes(a)) out.push({ key: 'own-' + d.id + a, level: 'contraindicated', type: 'allergy', drug: d.name, other: patient.allergies, source: 'Patient record' })

  for (const r of getState().ddi) {
    const hits = lines.filter(({ d }) => matches(r.a, r.aAtc, d))
    if (!hits.length) continue
    const base = { level: r.level, type: r.type, source: r.source, other: r.b }
    if (r.type === 'allergy') {
      const word = fold(r.b.replace(/allergy/i, '')).split(' ')[0]
      if (word && allergies.includes(word)) hits.forEach(({ d }) => out.push({ ...base, key: r.id + d.id, drug: d.name }))
    } else if (r.type === 'ddi' || r.type === 'class') {
      const p = partner(r.b)
      for (const h of hits)
        for (const o of lines)
          if (o.d.id !== h.d.id && matches(p.name, p.atc, o.d)) out.push({ ...base, key: r.id + h.d.id + o.d.id, drug: h.d.name, other: o.d.name })
    } else if (r.type === 'condition') {
      const words = CONDITION_WORDS[fold(r.b)] ?? [fold(r.b)]
      if (words.some((w) => history.includes(w))) hits.forEach(({ d }) => out.push({ ...base, key: r.id + d.id, drug: d.name, other: r.b + ' — ' + patient.history }))
    } else if (r.type === 'dose') {
      // Giới hạn liều theo nhóm tuổi chỉ nhắc, không chặn.
      const forChild = /child/i.test(r.b)
      if (forChild !== adult) hits.forEach(({ d }) => out.push({ ...base, level: 'warning', key: r.id + d.id, drug: d.name }))
    }
  }
  const seen = new Set()
  return out.filter((x) => !seen.has(x.key) && seen.add(x.key)).sort((a, b) => RANK[a.level] - RANK[b.level])
}

// Quy tắc có nhắc tới thuốc này, để bác sĩ tra trước khi kê.
export const rulesFor = (d) => getState().ddi.filter((r) => matches(r.a, r.aAtc, d) || (['ddi', 'class'].includes(r.type) && matches(partner(r.b).name, partner(r.b).atc, d)))
