import { useMemo, useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { syncQueue } from '../../api/queueStore'
import { createServiceOrder } from '../../api/serviceApi'
import { useServiceCatalog, orderable, toLabOrder, apiMessage } from '../../api/serviceStore'
import { LAB_GROUPS, SERVICE_GROUPS, SAMPLES } from '../admin/catalogs/schemas'
import { printHtml, esc } from '../admin/inventory/shared'
import { dmy, hhmm } from '../reception/shared'
import { fold, money } from '../../utils/format'
import Skeleton from '../../components/Skeleton'

// Xét nghiệm làm thủ công: bác sĩ lập và in phiếu, bệnh nhân cầm phiếu đi làm rồi mang kết quả giấy quay lại.
// Phiếu lưu ở server (ERD v2.1) — server tự đánh dấu đi xét nghiệm và đưa tiền dịch vụ vào hoá đơn.

// 'none' (chẩn đoán hình ảnh) = không lấy mẫu.
const sampleLabel = (k) => (k === 'none' ? '' : SAMPLES.find((s) => s.key === k)?.label ?? '')
// Xét nghiệm trước, rồi dịch vụ chẩn đoán / thủ thuật (bỏ nhóm khám bệnh).
const ORDER_GROUPS = [...LAB_GROUPS, ...SERVICE_GROUPS.filter((g) => g.key !== 'consult')]

// Cột “Kết quả” để trống cho nơi làm xét nghiệm ghi.
export function printLabOrder(visit, order) {
  const t = translate
  const tests = order.tests.filter((x) => !x.cancelled)
  const rows = [...tests.map((x) => [x.name, sampleLabel(x.sample) ? t(sampleLabel(x.sample)) : '']), ...(order.other ? [[order.other, '']] : [])]
    .map(([name, sample], i) => `<tr><td>${i + 1}</td><td><b>${esc(name)}</b></td><td>${esc(sample)}</td><td class="blank"></td></tr>`)
    .join('')
  printHtml(
    t('Lab test order'),
    `<h1>${esc(t('Lab test order'))}</h1>
    <p class="meta">${esc(t('Queue no.'))}: <b>${String(visit.ticket).padStart(3, '0')}</b> · ${esc(hhmm(order.at))} ${esc(dmy(order.at))}</p>
    <p class="meta">${esc(t('Patient'))}: <b>${esc(visit.name)}</b> · ${esc(t(visit.gender))}${visit.age !== '' ? ', ' + visit.age + ' ' + esc(t('yrs')) : ''} · ${esc(visit.patientId)}</p>
    ${visit.phone ? `<p class="meta">${esc(t('Phone'))}: ${esc(visit.phone)}</p>` : ''}
    <p class="meta">${esc(t('Provisional diagnosis'))}: ${esc(order.diagnosis || '—')}</p>
    ${order.packageName ? `<p class="meta">${esc(t('Package'))}: <b>${esc(order.packageName)}</b></p>` : ''}
    <table><thead><tr><th>#</th><th>${esc(t('Test name'))}</th><th>${esc(t('Sample'))}</th><th>${esc(t('Result'))}</th></tr></thead><tbody>${rows}</tbody></table>
    ${order.note ? `<p class="meta">${esc(t('Note'))}: ${esc(order.note)}</p>` : ''}
    <p class="meta" style="margin-top:18px;text-align:right">${esc(dmy(order.at))}<br>${esc(t('Ordering doctor'))}<br><br><b>${esc(order.by)}</b></p>`,
    'labOrder'
  )
}

export default function LabOrderModal({ open, visit, diagnosis, onClose, onSent }) {
  const { showToast } = useToast()
  const cat = useServiceCatalog()
  const [picked, setPicked] = useState([])
  const [pkg, setPkg] = useState('')
  const [q, setQ] = useState('')
  const [other, setOther] = useState('')
  const [dx, setDx] = useState(diagnosis ?? '')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // { code, name, group, sample, price }
  const labs = useMemo(
    () => orderable(cat.services).map((s) => ({ code: s.service_id, name: s.name, group: s.group_key, sample: s.sample ?? '', price: s.price })),
    [cat.services]
  )
  const packages = cat.packages.filter((p) => p.is_active !== false)
  const inPkg = new Set(packages.find((p) => p.package_id === pkg)?.items.map((x) => x.service_id) ?? [])

  const groups = useMemo(() => {
    const k = fold(q.trim())
    const list = labs.filter((x) => !k || fold(x.name).includes(k) || fold(x.code).includes(k))
    return ORDER_GROUPS.map((g) => ({ ...g, rows: list.filter((x) => x.group === g.key) })).filter((g) => g.rows.length)
  }, [labs, q])

  const toggle = (code) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]))
  const count = picked.filter((c) => !inPkg.has(c)).length + inPkg.size + (other.trim() ? 1 : 0)

  async function submit() {
    setSaving(true)
    try {
      const order = await createServiceOrder(visit.id, {
        // Dịch vụ đã có trong gói thì server tự bỏ (không tính hai lần).
        service_ids: picked.filter((c) => !inPkg.has(c)),
        package_id: pkg || null,
        other_items: other.trim() ? [other.trim()] : [],
        diagnosis: dx.trim() || null,
        note: note.trim() || null
      })
      printLabOrder(visit, toLabOrder(order))
      await syncQueue()
      showToast('Lab order sent to the printer — continue when the patient brings the results back')
      onSent()
    } catch (e) {
      showToast(translate(apiMessage(e)), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} wide>
      <ModalHeader title={translate('Lab test order') + ' — ' + visit.name} onClose={onClose} />
      <div className="modal-b">
        {cat.error && (
          <div className="banner w">
            <Icon name="triangle-alert" />
            <div className="txt">{cat.error}</div>
          </div>
        )}
        {packages.length > 0 && (
          <div className="field">
            <label>Package</label>
            <select className="input" value={pkg} onChange={(e) => setPkg(e.target.value)}>
              <option value="">{translate('No package')}</option>
              {packages.map((p) => (
                <option key={p.package_id} value={p.package_id}>
                  {p.name} — {money(p.price)} ({p.items.map((x) => x.name).join(', ')})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="search" style={{ width: '100%' }}>
          <Icon name="search" />
          <input className="input" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={translate('Search tests by name or code…')} />
        </div>
        <div className="lab-pick">
          {groups.map((g) => (
            <div key={g.key} className="lab-pick-group">
              <div className="sec-t">{translate(g.label)}</div>
              {g.rows.map((x) => {
                const fromPkg = inPkg.has(x.code)
                return (
                  <label key={x.code} className={'lab-pick-row' + (picked.includes(x.code) || fromPkg ? ' on' : '')}>
                    <input type="checkbox" checked={picked.includes(x.code) || fromPkg} disabled={fromPkg} onChange={() => toggle(x.code)} />
                    <span className="lab-pick-name">{x.name}</span>
                    {fromPkg ? <small>{translate('In package')}</small> : sampleLabel(x.sample) && <small>{translate(sampleLabel(x.sample))}</small>}
                    {!fromPkg && x.price > 0 && <small className="num">{money(x.price)}</small>}
                  </label>
                )
              })}
            </div>
          ))}
          {!cat.loaded && <Skeleton rows={4} cols={2} compact />}
          {cat.loaded && !groups.length && <p className="muted">{translate('No tests match your search.')}</p>}
        </div>
        <div className="fg" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Other tests (not in the catalog)</label>
            <input className="input" type="text" value={other} onChange={(e) => setOther(e.target.value)} placeholder="e.g. Abdominal ultrasound" />
            {other.trim() && <small className="hint">{translate('Not in the catalog — no price; reception adds it to the invoice by hand.')}</small>}
          </div>
          <div className="field">
            <label>Provisional diagnosis</label>
            <input className="input" type="text" value={dx} onChange={(e) => setDx(e.target.value)} placeholder="Shown on the printed order" />
          </div>
        </div>
        <div className="field">
          <label>Note for the lab</label>
          <input className="input" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Fasting sample, urgent" />
        </div>
      </div>
      <div className="modal-f">
        <span className="muted small">
          {count} {translate(count === 1 ? 'test selected' : 'tests selected')}
        </span>
        <span className="sp" />
        <button className="btn btn-outline" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={!count || saving}>
          <Icon name="printer" /> Save &amp; print order
        </button>
      </div>
    </Modal>
  )
}
