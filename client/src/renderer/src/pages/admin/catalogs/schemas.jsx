// Cấu hình của từng danh mục: trường nhập, cột hiển thị, cột file Excel/CSV, bộ lọc riêng.
// Trang chi tiết (CatalogDetailPage) đọc cấu hình này nên thêm danh mục mới chỉ cần thêm 1 mục ở đây
// (+ dữ liệu mẫu trong api/catalogStore.js).
import { fmtMoney, fmtDate } from '../inventory/shared'

export const GENERAL_GROUPS = [
  { key: 'gender', label: 'Gender' },
  { key: 'ethnicity', label: 'Ethnicity' },
  { key: 'occupation', label: 'Occupation' },
  { key: 'relationship', label: 'Relationship' },
  { key: 'blood', label: 'Blood type' }
]
export const SERVICE_GROUPS = [
  { key: 'consult', label: 'Consultation' },
  { key: 'procedure', label: 'Procedure' },
  { key: 'injection', label: 'Injection / infusion' },
  { key: 'diagnostic', label: 'Diagnostic' }
]
export const LAB_GROUPS = [
  { key: 'hematology', label: 'Hematology' },
  { key: 'biochemistry', label: 'Biochemistry' },
  { key: 'immunology', label: 'Immunology' },
  { key: 'urine', label: 'Urinalysis' },
  { key: 'imaging', label: 'Imaging' }
]
export const SAMPLES = [
  { key: 'blood', label: 'Blood' },
  { key: 'urine', label: 'Urine' },
  { key: 'stool', label: 'Stool' },
  { key: 'swab', label: 'Swab' },
  { key: 'none', label: 'No sample' }
]
const ADDRESS_LEVELS = [
  { key: 'province', label: 'Province level' },
  { key: 'commune', label: 'Ward / commune' }
]
const ADDRESS_TYPES = [
  { key: 'city', label: 'Centrally-run city' },
  { key: 'province', label: 'Province' },
  { key: 'ward', label: 'Ward' },
  { key: 'commune', label: 'Commune' },
  { key: 'zone', label: 'Special zone' }
]
const UNIT_KINDS = [
  { key: 'drug', label: 'Drug / supply' },
  { key: 'measure', label: 'Measurement' },
  { key: 'service', label: 'Service' }
]
const ADVICE_KINDS = [
  { key: 'general', label: 'General advice' },
  { key: 'medication', label: 'About medication' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'warning', label: 'Warning sign' }
]
export const optLabel = (opts, k) => opts.find((o) => o.key === k)?.label ?? k ?? ''

const T = ({ children }) => <span>{children}</span>
// Cột hiển thị nhãn của 1 trường dạng chọn — trang chi tiết gọi render(row, cats, inv, key).
const opt = (opts) =>
  function renderOpt(r, cats, inv, k) {
    return <T>{optLabel(opts, r[k])}</T>
  }

// Tham chiếu dịch vụ / xét nghiệm trong gói khám: "service:DV01" | "lab:XN05".
export function resolveRef(ref, cats) {
  const [kind, code] = ref.split(':')
  const list = kind === 'service' ? cats.services : cats.labs
  return list.find((r) => r.code === code) ?? null
}
export function packageTotal(row, cats) {
  return (row.items ?? []).reduce((s, it) => s + (resolveRef(it.ref, cats)?.price ?? 0) * it.qty, 0)
}

export const SCHEMAS = {
  general: {
    title: 'General',
    group: 'admin',
    desc: 'Values used on patient records: gender, ethnicity, occupation, relationship, blood type',
    filter: { field: 'group', options: GENERAL_GROUPS },
    fields: [
      { key: 'group', label: 'Group', type: 'select', options: GENERAL_GROUPS, required: true },
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Name', required: true }
    ],
    columns: [{ key: 'group', label: 'Group', render: opt(GENERAL_GROUPS) }],
    csv: ['code', 'name', 'group']
  },
  address: {
    title: 'Addresses',
    group: 'admin',
    desc: '34 province-level units after the July 2025 reorganisation; wards / communes imported from the official list',
    filter: { field: 'level', options: ADDRESS_LEVELS },
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Name', required: true },
      { key: 'level', label: 'Level', type: 'select', options: ADDRESS_LEVELS, required: true },
      { key: 'type', label: 'Type', type: 'select', options: ADDRESS_TYPES },
      { key: 'parent', label: 'Province code (for wards / communes)' },
      { key: 'mergedFrom', label: 'Merged from', wide: true },
      { key: 'effectiveFrom', label: 'Effective from', type: 'date' }
    ],
    columns: [
      { key: 'type', label: 'Type', render: opt(ADDRESS_TYPES) },
      { key: 'mergedFrom', label: 'Merged from', render: (r) => r.mergedFrom || <span className="ai-soft">—</span> },
      { key: 'effectiveFrom', label: 'Effective from', render: (r) => <span className="mono">{fmtDate(r.effectiveFrom)}</span> }
    ],
    csv: ['code', 'name', 'level', 'type', 'parent', 'mergedFrom', 'effectiveFrom']
  },
  icd: {
    title: 'Diseases (ICD-10)',
    group: 'medical',
    desc: 'ICD-10 diagnosis codes (WHO / Ministry of Health). Codes added by hand are marked as custom.',
    codePattern: { re: /^[A-Z]\d{2}(\.\d{1,2})?$/, msg: 'ICD-10 code format: a letter + 2 digits, optionally "." + 1–2 digits (e.g. J03.9).' },
    upperCode: true,
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'chapter', label: 'Chapter' },
      { key: 'name', label: 'Vietnamese name', required: true, wide: true },
      { key: 'nameEn', label: 'English name', wide: true },
      { key: 'note', label: 'Note', wide: true }
    ],
    columns: [
      // Thêm ký tự rỗng (U+200B) để bộ dịch tự động KHÔNG đổi tên tiếng Anh sang tiếng Việt.
      { key: 'nameEn', label: 'English name', render: (r) => <span className="ai-soft">{r.nameEn ? r.nameEn + '\u200B' : ''}</span> },
      { key: 'chapter', label: 'Chapter', render: (r) => <span className="mono">{r.chapter}</span> },
      { key: 'custom', label: 'Source', render: (r) => (r.custom ? <span className="badge warn">Custom</span> : <span className="badge">Standard</span>) }
    ],
    csv: ['code', 'name', 'nameEn', 'chapter']
  },
  services: {
    title: 'Services & procedures',
    group: 'medical',
    desc: 'Billable services with unit price and price history — old invoices keep the price at the time they were issued',
    filter: { field: 'group', options: SERVICE_GROUPS },
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Name', required: true, wide: true },
      { key: 'group', label: 'Group', type: 'select', options: SERVICE_GROUPS, required: true },
      { key: 'unit', label: 'Unit' },
      { key: 'price', label: 'Unit price', type: 'money', required: true },
      { key: 'priceFrom', label: 'New price effective from', type: 'date', onlyWhenPriceChanges: true }
    ],
    columns: [
      { key: 'group', label: 'Group', render: opt(SERVICE_GROUPS) },
      { key: 'price', label: 'Unit price', num: true, render: (r) => <span className="mono">{fmtMoney(r.price)}</span> },
      {
        key: 'priceHistory',
        label: 'Price since',
        render: (r) => {
          const h = r.priceHistory ?? []
          const last = h[h.length - 1]
          return last ? (
            <span className="mono">
              {fmtDate(last.from)}
              {h.length > 1 && <span className="ai-soft"> · {fmtMoney(h[h.length - 2].price)} →</span>}
            </span>
          ) : (
            '—'
          )
        }
      }
    ],
    csv: ['code', 'name', 'group', 'unit', 'price']
  },
  packages: {
    title: 'Check-up packages',
    group: 'medical',
    desc: 'Packages made of services and lab tests from the catalogs, with a package price',
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Name', required: true, wide: true },
      { key: 'items', label: 'Included services & tests', type: 'pkgItems', wide: true },
      { key: 'price', label: 'Package price', type: 'money', required: true }
    ],
    columns: [
      { key: 'items', label: 'Included', render: (r, cats) => (r.items ?? []).map((it) => resolveRef(it.ref, cats)?.name ?? it.ref).join(' · ') },
      { key: 'total', label: 'Separate price', num: true, render: (r, cats) => <span className="mono ai-soft">{fmtMoney(packageTotal(r, cats))}</span> },
      { key: 'price', label: 'Package price', num: true, render: (r) => <b className="mono">{fmtMoney(r.price)}</b> }
    ],
    csv: ['code', 'name', 'price']
  },
  labs: {
    title: 'Lab tests',
    group: 'medical',
    desc: 'Lab and imaging tests with unit, reference range, sample type and price',
    filter: { field: 'group', options: LAB_GROUPS },
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Name', required: true, wide: true },
      { key: 'group', label: 'Group', type: 'select', options: LAB_GROUPS, required: true },
      { key: 'unit', label: 'Unit' },
      { key: 'low', label: 'Reference low', type: 'number' },
      { key: 'high', label: 'Reference high', type: 'number' },
      { key: 'refText', label: 'Reference note', wide: true },
      { key: 'sample', label: 'Sample', type: 'select', options: SAMPLES },
      { key: 'price', label: 'Price', type: 'money' }
    ],
    columns: [
      { key: 'group', label: 'Group', render: opt(LAB_GROUPS) },
      { key: 'unit', label: 'Unit', render: (r) => <span className="mono">{r.unit || '—'}</span> },
      {
        key: 'range',
        label: 'Reference range',
        render: (r) => (
          <span className="mono">
            {r.low != null && r.high != null ? `${r.low} – ${r.high}` : r.high != null ? `≤ ${r.high}` : r.low != null ? `≥ ${r.low}` : ''}
            {r.refText && <span className="ai-soft"> {r.refText}</span>}
          </span>
        )
      },
      { key: 'sample', label: 'Sample', render: opt(SAMPLES) },
      { key: 'price', label: 'Price', num: true, render: (r) => <span className="mono">{r.price ? fmtMoney(r.price) : '—'}</span> }
    ],
    csv: ['code', 'name', 'group', 'unit', 'low', 'high', 'refText', 'sample', 'price']
  },
  units: {
    title: 'Units of measure',
    group: 'medical',
    desc: 'Units used for drugs, measurements and services',
    filter: { field: 'kind', options: UNIT_KINDS },
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Name', required: true },
      { key: 'kind', label: 'Used for', type: 'select', options: UNIT_KINDS, required: true }
    ],
    columns: [{ key: 'kind', label: 'Used for', render: opt(UNIT_KINDS) }],
    csv: ['code', 'name', 'kind']
  },
  routes: {
    title: 'Routes of administration',
    group: 'medical',
    desc: 'How a drug is given — used on prescriptions and prescription templates',
    upperCode: true,
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Name', required: true }
    ],
    columns: [],
    csv: ['code', 'name']
  },
  rxtemplates: {
    title: 'Prescription templates',
    group: 'medical',
    desc: 'Ready-made prescriptions by diagnosis — drugs come from the drug catalog, advice from the advice list',
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Name', required: true, wide: true },
      { key: 'icd', label: 'Diagnosis (ICD-10)', type: 'icd' },
      { key: 'items', label: 'Drugs', type: 'rxItems', wide: true },
      { key: 'advice', label: 'Advice', type: 'advicePick', wide: true }
    ],
    columns: [
      { key: 'icd', label: 'ICD-10', render: (r) => <span className="mono">{r.icd || '—'}</span> },
      { key: 'items', label: 'Drugs', render: (r, cats, inv) => (r.items ?? []).map((it) => inv.drugs.find((d) => d.id === it.drugId)?.name ?? it.drugId).join(' · ') },
      { key: 'advice', label: 'Advice', num: true, render: (r) => <span className="mono">{(r.advice ?? []).length}</span> }
    ],
    csv: ['code', 'name', 'icd']
  },
  advice: {
    title: 'Advice phrases',
    group: 'medical',
    desc: 'Standard advice printed on prescriptions',
    filter: { field: 'kind', options: ADVICE_KINDS },
    fields: [
      { key: 'code', label: 'Code', required: true },
      { key: 'kind', label: 'Type', type: 'select', options: ADVICE_KINDS, required: true },
      { key: 'name', label: 'Advice', required: true, type: 'textarea', wide: true }
    ],
    columns: [{ key: 'kind', label: 'Type', render: opt(ADVICE_KINDS) }],
    csv: ['code', 'name', 'kind']
  }
}
