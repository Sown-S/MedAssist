import { useMemo, useState } from 'react'
import Modal, { ModalHeader } from '../../components/Modal'
import Icon from '../../components/Icon'
import { useToast } from '../../context/ToastContext'
import { translate } from '../../i18n'
import { useCatalogs } from '../../api/catalogStore'
import { sendToLabs } from '../../api/queueStore'
import { LAB_GROUPS, SAMPLES } from '../admin/catalogs/schemas'
import { printHtml, esc } from '../admin/inventory/shared'
import { dmy, hhmm } from '../reception/shared'

// Phòng khám nhỏ: xét nghiệm làm THỦ CÔNG — bác sĩ chỉ lập phiếu chỉ định và in ra giấy,
// bệnh nhân cầm phiếu đi làm xét nghiệm, nhận kết quả giấy rồi quay lại phòng khám.
// Hệ thống không nhận kết quả từ phòng xét nghiệm; bác sĩ tự ghi tóm tắt kết quả khi khám tiếp.

const norm = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
// 'none' (chẩn đoán hình ảnh) = không lấy mẫu → để trống.
const sampleLabel = (k) => (k === 'none' ? '' : SAMPLES.find((s) => s.key === k)?.label ?? '')

// In phiếu chỉ định (khổ giấy theo Cài đặt › In ấn › Phiếu chỉ định xét nghiệm). Cột "Kết quả" để trống cho nơi làm xét nghiệm ghi.
export function printLabOrder(visit, order) {
  const t = translate
  const rows = [...order.tests.map((x) => [x.name, sampleLabel(x.sample) ? t(sampleLabel(x.sample)) : '']), ...(order.other ? [[order.other, '']] : [])]
    .map(([name, sample], i) => `<tr><td>${i + 1}</td><td><b>${esc(name)}</b></td><td>${esc(sample)}</td><td class="blank"></td></tr>`)
    .join('')
  printHtml(
    t('Lab test order'),
    `<h1>${esc(t('Lab test order'))}</h1>
    <p class="meta">${esc(t('Queue no.'))}: <b>${String(visit.ticket).padStart(3, '0')}</b> · ${esc(hhmm(order.at))} ${esc(dmy(order.at))}</p>
    <p class="meta">${esc(t('Patient'))}: <b>${esc(visit.name)}</b> · ${esc(t(visit.gender))}${visit.age !== '' ? ', ' + visit.age + ' ' + esc(t('yrs')) : ''} · ${esc(visit.patientId)}</p>
    ${visit.phone ? `<p class="meta">${esc(t('Phone'))}: ${esc(visit.phone)}</p>` : ''}
    <p class="meta">${esc(t('Provisional diagnosis'))}: ${esc(order.diagnosis || '—')}</p>
    <table><thead><tr><th>#</th><th>${esc(t('Test name'))}</th><th>${esc(t('Sample'))}</th><th>${esc(t('Result'))}</th></tr></thead><tbody>${rows}</tbody></table>
    ${order.note ? `<p class="meta">${esc(t('Note'))}: ${esc(order.note)}</p>` : ''}
    <p class="meta" style="margin-top:18px;text-align:right">${esc(dmy(order.at))}<br>${esc(t('Ordering doctor'))}<br><br><b>${esc(order.by)}</b></p>`,
    'labOrder'
  )
}

export default function LabOrderModal({ open, visit, user, diagnosis, onClose, onSent }) {
  const { showToast } = useToast()
  const labs = useCatalogs().labs
  const [picked, setPicked] = useState([])
  const [q, setQ] = useState('')
  const [other, setOther] = useState('')
  const [dx, setDx] = useState(diagnosis ?? '')
  const [note, setNote] = useState('')

  const groups = useMemo(() => {
    const k = norm(q.trim())
    const list = labs.filter((x) => x.active !== false && (!k || norm(x.name).includes(k) || norm(x.code).includes(k)))
    return LAB_GROUPS.map((g) => ({ ...g, rows: list.filter((x) => x.group === g.key) })).filter((g) => g.rows.length)
  }, [labs, q])

  const toggle = (code) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]))
  const count = picked.length + (other.trim() ? 1 : 0)

  function submit() {
    const tests = labs.filter((x) => picked.includes(x.code)).map((x) => ({ code: x.code, name: x.name, group: x.group, sample: x.sample ?? '' }))
    const r = sendToLabs(visit.id, { tests, other, diagnosis: dx, note }, user)
    if (!r.ok) return showToast(translate(r.error))
    printLabOrder(visit, r.order)
    showToast('Lab order sent to the printer — continue when the patient brings the results back')
    onSent()
  }

  return (
    <Modal open={open} onClose={onClose} wide>
      <ModalHeader title={translate('Lab test order') + ' — ' + visit.name} onClose={onClose} />
      <div className="modal-body">
        <div className="field">
          <input type="text" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tests by name or code…" />
        </div>
        <div className="lab-pick">
          {groups.map((g) => (
            <div key={g.key} className="lab-pick-group">
              <div className="section-label">{translate(g.label)}</div>
              {g.rows.map((x) => (
                <label key={x.code} className={'lab-pick-row' + (picked.includes(x.code) ? ' on' : '')}>
                  <input type="checkbox" checked={picked.includes(x.code)} onChange={() => toggle(x.code)} />
                  <span className="lab-pick-name">{x.name}</span>
                  {sampleLabel(x.sample) && <small>{translate(sampleLabel(x.sample))}</small>}
                </label>
              ))}
            </div>
          ))}
          {!groups.length && <p className="ai-soft">{translate('No tests match your search.')}</p>}
        </div>
        <div className="form-grid cols-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Other tests (not in the catalog)</label>
            <input type="text" value={other} onChange={(e) => setOther(e.target.value)} placeholder="e.g. Abdominal ultrasound" />
          </div>
          <div className="field">
            <label>Provisional diagnosis</label>
            <input type="text" value={dx} onChange={(e) => setDx(e.target.value)} placeholder="Shown on the printed order" />
          </div>
        </div>
        <div className="field">
          <label>Note for the lab</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Fasting sample, urgent" />
        </div>
      </div>
      <div className="modal-foot">
        <span className="ai-soft" style={{ marginRight: 'auto', alignSelf: 'center' }}>
          {count} {translate('tests selected')}
        </span>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={!count}>
          <Icon name="printer" /> Save &amp; print order
        </button>
      </div>
    </Modal>
  )
}
