// Test hợp đồng client ↔ server.
// 1. Mỗi fixture (response thật chụp từ server, xem scripts/contract/capture_fixtures.py) phải khớp schema OpenAPI
//    hiện hành (tests/contract/openapi.json, CI server kiểm bản chụp này khớp code server).
// 2. Mỗi hàm chuyển đổi chỉ được đọc trường có trong schema: dữ liệu đưa vào được bọc Proxy ghi lại mọi trường bị đọc,
//    đọc trường không có trong schema (vd p.code thay vì patient_code) là test đỏ — đúng loại lỗi đã gặp ở bản 0.2.6.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { toPatient, toPatientSummary, toQueueVisit, toVisitDetail, pregnancyOf } from '../../src/renderer/src/api/clinicApi.js'
import { fromServerRx } from '../../src/renderer/src/api/prescriptionApi.js'
import { fromAwaiting } from '../../src/renderer/src/api/billingApi.js'
import { toDrug } from '../../src/renderer/src/api/serverDrugs.js'
import { fromRow } from '../../src/renderer/src/api/symptoms.js'
import { fromServerDrug, fromServerBatch } from '../../src/renderer/src/api/inventoryStore.js'
import { fromServer as fromAccount } from '../../src/renderer/src/api/accountStore.js'
import { fromServer as fromRoom } from '../../src/renderer/src/api/roomStore.js'
import { fromService, fromPackage } from '../../src/renderer/src/api/serviceCatalogLive.js'
import { toLabOrder } from '../../src/renderer/src/api/serviceStore.js'

const DIR = join(import.meta.dirname)
const openapi = JSON.parse(readFileSync(join(DIR, 'openapi.json'), 'utf8'))
const fixtures = Object.fromEntries(
  readdirSync(join(DIR, 'fixtures'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(DIR, 'fixtures', f), 'utf8'))])
)

// Schema response của một fixture theo path mẫu, method và status.
function responseSchema(fx) {
  const op = openapi.paths[fx.path]?.[fx.method]
  if (!op) throw new Error(`OpenAPI không có ${fx.method.toUpperCase()} ${fx.path}`)
  const res = op.responses[String(fx.status)] ?? op.responses.default
  return res?.content?.['application/json']?.schema ?? {}
}

const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
ajv.addSchema({ $id: 'openapi', components: openapi.components })
// $ref "#/components/…" của FastAPI → trỏ vào schema "openapi" đã nạp.
const rebase = (s) => JSON.parse(JSON.stringify(s).replaceAll('"#/components/', '"openapi#/components/'))

describe('Fixture khớp schema OpenAPI hiện hành', () => {
  for (const [name, fx] of Object.entries(fixtures)) {
    it(name, () => {
      expect(fx.status, `${name}: chụp fixture bị lỗi HTTP`).toBeLessThan(300)
      const validate = ajv.compile(rebase(responseSchema(fx)))
      const ok = validate(fx.body)
      expect(ok, ajv.errorsText(validate.errors, { separator: '\n' })).toBe(true)
    })
  }
})

// ---- Theo dõi trường bị đọc ----
const deref = (s) => {
  let x = s ?? {}
  for (let i = 0; i < 20 && x.$ref; i++) x = x.$ref.split('/').slice(1).reduce((o, k) => o[k], openapi)
  return x
}
// Gom các nhánh anyOf / oneOf / allOf (vd "X | null") thành danh sách schema thật.
const branches = (s) => {
  const x = deref(s)
  const sub = x.anyOf ?? x.oneOf ?? x.allOf
  return sub ? sub.flatMap(branches) : [x]
}
const propSchema = (s, key) => {
  for (const b of branches(s)) {
    if (b.properties?.[key]) return { found: true, schema: b.properties[key] }
    if (b.additionalProperties && typeof b.additionalProperties === 'object') return { found: true, schema: b.additionalProperties }
    if (b.additionalProperties === true || (b.type === 'object' && !b.properties)) return { found: true, schema: {} }
  }
  return { found: false }
}
const itemSchema = (s) => branches(s).find((b) => b.items)?.items ?? {}
// Thuộc tính có sẵn của mảng / object không phải trường dữ liệu (map, length, toString…).
const BUILTIN = new Set(['length', 'constructor', 'toJSON', 'then', '$$typeof', 'valueOf', 'toString'])

function track(value, schema, path, misses) {
  if (value === null || typeof value !== 'object') return value
  return new Proxy(value, {
    get(target, key, recv) {
      const v = Reflect.get(target, key, recv)
      if (typeof key === 'symbol' || BUILTIN.has(key)) return v
      if (Array.isArray(target)) {
        if (/^\d+$/.test(key)) return track(v, itemSchema(schema), `${path}[${key}]`, misses)
        // map / filter / find… gọi lại qua Proxy nên phần tử vẫn được theo dõi.
        return v
      }
      if (key in Object.prototype) return v
      const p = propSchema(schema, key)
      if (!p.found) misses.add(`${path}.${key}`)
      return track(v, p.schema ?? {}, `${path}.${key}`, misses)
    }
  })
}

// Chạy hàm chuyển đổi trên fixture được theo dõi; trả về kết quả và các trường đọc mà schema không có.
function run(fixtureName, pick, mapper) {
  const fx = fixtures[fixtureName]
  const schema = responseSchema(fx)
  const { value, schema: sub } = pick(fx.body, schema)
  const misses = new Set()
  const out = mapper(track(value, sub, fixtureName, misses))
  return { out, misses: [...misses] }
}
const whole = (body, schema) => ({ value: body, schema })
const first = (body, schema) => {
  const list = Array.isArray(body) ? body : body.items
  const listSchema = Array.isArray(body) ? schema : propSchema(schema, 'items').schema
  expect(list.length, 'fixture rỗng, chụp lại với dữ liệu kiểm thử').toBeGreaterThan(0)
  return { value: list[0], schema: itemSchema(listSchema) }
}

describe('Hàm chuyển đổi chỉ đọc trường có trong schema', () => {
  const cases = [
    ['toPatient ← GET /patients/{id}', 'patient', whole, toPatient],
    ['toPatientSummary ← GET /patients (danh sách)', 'patients_list', first, toPatientSummary],
    ['toPatientSummary ← GET /patients/lookup', 'patient_lookup', first, toPatientSummary],
    ['toQueueVisit ← GET /queue', 'queue', first, toQueueVisit],
    ['pregnancyOf ← GET /visits/{id}', 'visit', whole, pregnancyOf],
    ['toVisitDetail ← GET /visits/{id}', 'visit', whole, (v) => toVisitDetail(v, [], { allergies: '', history: '', phone: '', code: '', dob: '' })],
    ['fromServerRx ← GET /prescriptions', 'prescriptions', first, fromServerRx],
    ['fromAwaiting ← GET /billing/awaiting', 'billing_awaiting', first, fromAwaiting],
    ['toDrug ← GET /drugs', 'drugs', first, (d) => toDrug(d, undefined)],
    ['fromServerDrug ← GET /drugs', 'drugs', first, (d) => fromServerDrug(d)],
    ['fromServerBatch ← GET /inventory/batches', 'inventory_batches', first, fromServerBatch],
    ['fromRow ← GET /symptoms', 'symptoms', first, fromRow],
    ['tài khoản ← GET /admin/users', 'admin_users', first, fromAccount],
    ['phòng ← GET /rooms', 'rooms', first, fromRoom],
    ['dịch vụ ← GET /services', 'services', first, fromService],
    ['gói dịch vụ ← GET /service-packages', 'service_packages', first, fromPackage],
    ['toLabOrder ← GET /visits/{id}/service-orders', 'visit_service_orders', first, toLabOrder]
  ]
  for (const [title, fx, pick, mapper] of cases) {
    it(title, () => {
      if (!fixtures[fx]) throw new Error(`thiếu fixture ${fx}`)
      const body = fixtures[fx].body
      if (pick === first && !(Array.isArray(body) ? body : body.items)?.length) return // danh sách rỗng trong dữ liệu chụp
      const { misses } = run(fx, pick, mapper)
      expect(misses, 'client đọc trường server không trả về').toEqual([])
    })
  }

  it('toPatient lấy đúng mã BN và giới tính từ response thật', () => {
    const body = fixtures.patient.body
    const p = toPatient(body)
    expect(p.code).toBe(body.patient_code)
    expect(['Female', 'Male', 'Other']).toContain(p.gender)
  })
})
