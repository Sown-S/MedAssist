import Icon from '../../../components/Icon'
import Modal, { ModalHeader } from '../../../components/Modal'
import { translate } from '../../../i18n'
import { useToast } from '../../../context/ToastContext'
import { importRows } from '../../../api/catalogStore'
import { todayISO } from '../../../api/inventoryStore'
import { exportCsv } from '../inventory/shared'
import { SCHEMAS } from './schemas'

// ---------- CSV ----------
export function splitCsv(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && line[i + 1] === '"' && q) {
      cur += '"'
      i++
    } else if (ch === '"') q = !q
    else if (ch === ',' && !q) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

export const csvValue = (schema, key, v) => {
  const f = schema.fields.find((x) => x.key === key)
  if (Array.isArray(v)) return v.join('; ')
  if (f?.type === 'select') return v ?? ''
  return v ?? ''
}

export function exportCatalog(key, rows) {
  const s = SCHEMAS[key]
  exportCsv(
    `danh-muc-${key}-${todayISO()}.csv`,
    [...s.csv.map((k) => s.fields.find((f) => f.key === k)?.label ?? k), 'Status'],
    rows.map((r) => [...s.csv.map((k) => csvValue(s, k, r[k])), translate(r.active ? 'In use' : 'Discontinued')])
  )
}

// Đọc file: dòng đầu là tên cột (khoá trường, VD code,name,...). Trả về dòng hợp lệ + lỗi theo số dòng.
export function parseCatalogCsv(key, text) {
  const s = SCHEMAS[key]
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return { rows: [], errors: [{ n: 0, msg: 'The file is empty.' }] }
  const head = splitCsv(lines[0]).map((h) => h.trim())
  const known = s.csv.filter((k) => head.includes(k))
  if (!head.includes('code') || !head.includes('name')) return { rows: [], errors: [{ n: 1, msg: 'The first row must contain the columns: ' + s.csv.join(', ') }] }
  const rows = []
  const errors = []
  const seen = new Set()
  lines.slice(1).forEach((line, i) => {
    const n = i + 2
    const cells = splitCsv(line)
    const r = {}
    for (const k of known) {
      let v = cells[head.indexOf(k)] ?? ''
      const f = s.fields.find((x) => x.key === k)
      if (f?.type === 'money' || f?.type === 'number') v = v === '' ? null : Number(String(v).replace(/[^\d.-]/g, ''))
      if (k === 'code' && s.upperCode) v = String(v).toUpperCase()
      r[k] = v
    }
    if (!r.code || !r.name) return errors.push({ n, msg: 'Missing code or name.' })
    if (s.codePattern && !s.codePattern.re.test(r.code)) return errors.push({ n, msg: s.codePattern.msg })
    const bad = s.fields.find((f) => f.type === 'select' && known.includes(f.key) && r[f.key] && !f.options.some((o) => o.key === r[f.key]))
    if (bad) return errors.push({ n, msg: translate('Unknown value') + ' — ' + translate(bad.label) + ': ' + r[bad.key] })
    if (seen.has(r.code.toLowerCase())) return errors.push({ n, msg: 'Duplicate code in the file.' })
    seen.add(r.code.toLowerCase())
    if (key === 'icd') r.custom = false
    rows.push(r)
  })
  return { rows, errors }
}

// Đọc file người dùng chọn → kết quả xem trước (số dòng mới / cập nhật / lỗi).
export function readCatalogFile(e, catalogKey, all, setImp) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const r = parseCatalogCsv(catalogKey, String(reader.result))
    const existing = new Set(all.map((x) => x.code.toLowerCase()))
    setImp({ fileName: file.name, ...r, added: r.rows.filter((x) => !existing.has(x.code.toLowerCase())).length })
  }
  reader.readAsText(file, 'utf-8')
}

export function ImportModal({ catalogKey, imp, user, onClose }) {
  const { showToast } = useToast()
  if (!imp) return null
  const s = SCHEMAS[catalogKey]
  const downloadTemplate = () =>
    exportCsv(`mau-${catalogKey}.csv`, s.csv, [s.csv.map((k) => (k === 'code' ? (catalogKey === 'icd' ? 'J02.0' : 'MA01') : k === 'name' ? 'Tên mẫu' : ''))])
  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title={translate('Import from Excel (CSV)') + ' · ' + translate(s.title) + ' · ' + imp.fileName} onClose={onClose} />
      <div className="modal-body">
        <p className="ai-hint">
          <span>Expected columns:</span> <code className="mono">{s.csv.join(',')}</code> ·{' '}
          <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
            <Icon name="download" /> <span>Template</span>
          </button>
        </p>
        <p>
          <b className="mono">{imp.added}</b> <span>new</span> · <b className="mono">{imp.rows.length - imp.added}</b> <span>existing codes will be updated</span> ·{' '}
          <b className="mono">{imp.errors.length}</b> <span>rows skipped</span>
        </p>
        {imp.errors.length > 0 && (
          <div className="warn-banner show caution">
            <div className="icon">
              <Icon name="alert" />
            </div>
            <div className="txt">
              {imp.errors.slice(0, 12).map((e) => (
                <div key={e.n}>
                  <span>Line</span> <span className="mono">{e.n}</span>: <span>{e.msg}</span>
                </div>
              ))}
              {imp.errors.length > 12 && <div>…</div>}
            </div>
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={!imp.rows.length}
          onClick={() => {
            const r = importRows(catalogKey, imp.rows, user, s.title, imp.fileName)
            onClose()
            showToast(translate('Imported') + `: +${r.added}, ~${r.updated}`)
          }}
        >
          Import valid rows
        </button>
      </div>
    </Modal>
  )
}
