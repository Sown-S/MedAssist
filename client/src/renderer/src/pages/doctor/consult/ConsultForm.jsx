import { useEffect, useRef, useState } from 'react'
import ConfirmModal from '../../../components/ConfirmModal'
import Icon from '../../../components/Icon'
import Button from '../../../components/Button'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { labRows, syncQueue } from '../../../api/queueStore'
import { useInventory, findDrugByName } from '../../../api/inventoryStore'
import LabOrderModal from '../LabOrderModal'
import { useAssessment } from '../AssessmentCard'
import { putServiceResults } from '../../../api/serviceApi'
import { useServiceOrders, toLabOrder, apiMessage } from '../../../api/serviceStore'
import CancelOrderItemModal from '../../../components/CancelOrderItemModal'
import { useServerDrugs, reloadServerDrugs, findServerDrug } from '../../../api/serverDrugs'
import { syncDiagnoses, savePrescription, confirmPrescription, completeExam, shortageOf } from '../../../api/examApi'
import { isServerOnline } from '../../../api/connectivity'
import ServerHistory from '../ServerHistory'
import { printPrescription } from '../printRx'
import { saveDraft, deleteDraft } from '../../../api/draftStore'
import DocumentModal from '../DocumentModal'
import VitalsFields from '../../../components/VitalsFields'
import { vitalsText, checkVitals } from '../../../api/vitals'
import { ReleaseModal, LeaveVisitModal } from '../doctorShared'
import { ReminderPanel } from './ReminderPanel'
import { RX, drugForTemplate, blankDose, num, perDay, usageOf, serverStockIssue, nextLineId, lineOf, serverItem, draftOf, isChild } from './rxDraft'
import { usePastVisits } from './usePastVisits'
import ConsultHeader from './ConsultHeader'
import LabResultsEntry from './LabResultsEntry'
import RxEditor, { DRUG_SEARCH_ID } from './RxEditor'
import SoapPanel from './SoapPanel'

// Phiếu khám của bệnh nhân đang trong phòng: SOAP, sinh hiệu, tiền sử, kê đơn, chốt đơn / kết thúc lượt.
// Bản nháp lưu trên máy (draftStore) theo từng thay đổi.
export default function ConsultForm({ visit, user, onDone, onNext }) {
  const { showToast } = useToast()
  const inv = useInventory()
  const srv = useServerDrugs({ enabled: true })
  const issueOf = (it) => serverStockIssue(it, srv.drugs)
  const past = usePastVisits(visit)
  const [d, setD] = useState(() => draftOf(visit))
  const [tab, setTab] = useState('clin')
  const [aiDecision, setAiDecision] = useState({})
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [labOpen, setLabOpen] = useState(false)
  const [handing, setHanding] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [docs, setDocs] = useState(false)
  const [tried, setTried] = useState(false)
  const [short, setShort] = useState(null)
  const [cancelRow, setCancelRow] = useState(null)
  // Phiếu chỉ định đọc từ GET /visits/{id}/service-orders.
  const so = useServiceOrders(visit.id)
  const labOrders = so.orders
  const resultOf = (r) => d.labResults[r.key] ?? r.result
  const conclusionOf = (o) => (d.labConclusions ?? {})[o.id] ?? o.conclusion

  const set = (patch) => setD((x) => ({ ...x, ...patch }))
  const setVital = (k, v) => setD((x) => ({ ...x, vitals: { ...x.vitals, [k]: v } }))
  const setLine = (id, patch) => setD((x) => ({ ...x, rx: x.rx.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
  // Tự tính số lượng và câu cách dùng (vẫn sửa tay được sau đó).
  function setDose(line, patch) {
    const dose = { ...line.dose, ...patch }
    const daily = perDay(dose)
    const auto = daily > 0 ? { usage: usageOf(dose, line.unit), ...(num(dose.days) > 0 ? { qty: String(Math.ceil(daily * num(dose.days))) } : {}) } : {}
    setLine(line.id, { dose, ...auto })
  }
  useEffect(() => {
    saveDraft(visit.id, d)
  }, [visit.id, d])

  const ai = useAssessment(visit)
  function decideAi(c, decision) {
    setAiDecision((x) => ({ ...x, [c.condition_code]: decision }))
    if (decision === 'accepted') set({ diagnosis: [c.icd10_code, c.name_vi].filter(Boolean).join(' — ') })
  }
  function addDrug(drug) {
    if (d.rx.some((x) => x.name === drug.name)) return showToast(translate('This drug is already on the prescription.'), 'error')
    set({ rx: [...d.rx, lineOf(drug)] })
  }
  function applyLines(lines) {
    const have = new Set(d.rx.map((x) => x.name))
    const add = lines
      .filter((l) => !have.has(l.name))
      .map((l) => ({
        id: nextLineId(),
        drugId: findServerDrug(l.name, srv.drugs)?.id,
        name: l.name,
        qty: String(l.qty),
        unit: l.unit,
        usage: l.usage,
        essential: !!findDrugByName(l.name, inv.drugs)?.essential,
        dose: { ...blankDose(), ...l.dose }
      }))
    if (!add.length) return showToast(translate('These drugs are already on the prescription.'), 'error')
    set({ rx: [...d.rx, ...add] })
  }
  // Đơn mẫu: tra từng dòng ra thuốc của danh mục server (có drug_id) để chốt được; thuốc không có thì bỏ qua và báo.
  function applyTemplate(tk) {
    const missing = []
    const lines = RX[tk].flatMap((t) => {
      const drug = drugForTemplate(t, srv.drugs)
      if (!drug) {
        missing.push(t.generic + ' ' + t.strength)
        return []
      }
      return [{ ...lineOf(drug), qty: String(t.qty), usage: t.usage, dose: { ...blankDose(), ...t.dose } }]
    })
    if (missing.length) showToast(translate('Not in the drug catalog on the server') + ': ' + missing.join(', '), 'error')
    const add = lines.filter((l) => !d.rx.some((x) => x.drugId === l.drugId || x.name === l.name))
    if (add.length) set({ rx: [...d.rx, ...add] })
    else if (!missing.length) showToast(translate('These drugs are already on the prescription.'), 'error')
  }
  // Đơn gần nhất trong mọi lần khám trước, kể cả lượt đã xong hôm nay.
  const last = past.find((v) => v.rx?.length)

  const issues = d.rx.map((it) => ({ it, issue: issueOf(it) })).filter((x) => x.issue && x.issue.level !== 'info')
  // FR03: hệ thống không đánh giá đơn, chỉ nhắc dị ứng / bệnh nền. Chỉ chặn khi thiếu dữ liệu bắt buộc:
  // chẩn đoán, số lượng + cách dùng, cân nặng trẻ em.
  const incomplete = d.rx.some((l) => !(parseInt(l.qty) > 0) || !l.usage.trim())
  const needWeight = isChild(visit) && d.rx.length > 0 && !(num(d.vitals.weight_kg) > 0)
  const vitalErr = checkVitals(d.vitals).errors
  const problem = !d.diagnosis.trim()
    ? 'Enter the diagnosis before finalizing.'
    : incomplete
      ? 'Enter the quantity and directions for every drug.'
      : needWeight
        ? 'Enter the child’s weight (kg) before finalizing — it is printed on the prescription.'
        : vitalErr.length
          ? 'Check the vital signs before finalizing.'
          : null

  // Ghi kết quả từng dòng và kết luận từng phiếu đã sửa. Trả false nếu lỗi.
  async function saveLabResults({ toast = false } = {}) {
    if (!labOrders.length) return true
    const items = labOrders
      .flatMap(labRows)
      .filter((r) => !r.cancelled && r.key in d.labResults && (d.labResults[r.key] ?? '').trim() !== r.result)
      .map((r) => ({ item_id: r.itemId, result: d.labResults[r.key].trim() || null }))
    const conclusions = labOrders
      .filter((o) => o.id in (d.labConclusions ?? {}) && d.labConclusions[o.id].trim() !== o.conclusion)
      .map((o) => ({ order_id: o.id, conclusion: d.labConclusions[o.id].trim() || null }))
    if (!items.length && !conclusions.length) {
      if (toast) showToast('Lab results are already saved')
      return true
    }
    try {
      const list = await putServiceResults(visit.id, items, conclusions)
      so.setOrders(list.map(toLabOrder))
      set({ labResults: {}, labConclusions: {} })
      if (toast) showToast('Lab results saved')
      return true
    } catch (e) {
      showToast(translate(apiMessage(e)), 'error')
      return false
    }
  }

  // Đồng bộ chẩn đoán → lưu đơn nháp → xác nhận. Thiếu thuốc (409 STOCK_SHORTAGE) → liệt kê từng thuốc,
  // chẩn đoán đã lưu giữ nguyên, chốt lại được.
  async function finalizeOnServer(andNext) {
    const mapped = d.rx.map((l) => serverItem(l, srv.drugs))
    const bad = mapped.find((x) => x.error)
    if (bad) return showToast(bad.error, 'error')
    // Kết quả cận lâm sàng lưu ở phiếu chỉ định — ghi trước khi chốt.
    if (!(await saveLabResults())) return
    const notes = [
      d.hpi.trim() && 'Bệnh sử: ' + d.hpi.trim(),
      typeof d.exam === 'string' && d.exam.trim() && 'Khám: ' + d.exam.trim(),
      typeof d.plan === 'string' && d.plan.trim() && 'Hướng xử trí: ' + d.plan.trim()
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 4000)
    try {
      await syncDiagnoses(visit.id, { primary: d.diagnosis, extra: d.diagnosesExtra ?? [], notes: notes || null, candidates: ai.candidates, assessmentId: ai.assessment_id })
      if (mapped.length) {
        await savePrescription(visit.id, mapped.map((x) => x.item))
        await confirmPrescription(visit.id)
      } else await completeExam(visit.id)
    } catch (e) {
      if (e.code === 'STOCK_SHORTAGE') {
        setShort(shortageOf(e, mapped.map((x) => x.line)))
        reloadServerDrugs()
      }
      return showToast(e.message || translate('Something went wrong'), 'error')
    }
    setShort(null)
    deleteDraft(visit.id)
    reloadServerDrugs()
    await syncQueue()
    showToast(mapped.length ? 'Prescription confirmed — stock deducted, sent to reception for dispensing and payment' : 'Visit completed — sent to reception for payment')
    onDone()
    if (andNext) onNext?.()
  }

  function finalize(andNext = false) {
    // Mất kết nối máy chủ → không chốt, phiếu nháp vẫn giữ ở máy này.
    if (!isServerOnline()) return showToast(translate('No connection to the clinic server — the visit cannot be finalized now. Your notes are kept on this computer.'), 'error')
    setTried(true)
    if (problem) {
      if (problem.startsWith('Enter the child') || problem.startsWith('Check the vital')) setTab('vitals')
      return showToast(translate(problem), 'error')
    }
    return finalizeOnServer(andNext)
  }
  // Nút và phím tắt dùng chung một khoá — bấm liên tiếp cũng chỉ chốt một đơn.
  const [runFinalize, finalizing] = useAsyncAction(finalize)
  // Phím tắt: Ctrl+Enter chốt đơn, Alt+D nhận gợi ý đứng đầu, Alt+T tới ô tìm thuốc, Alt+L chỉ định xét nghiệm.
  const finalizeRef = useRef(runFinalize)
  finalizeRef.current = runFinalize
  const acceptTopRef = useRef(null)
  acceptTopRef.current = () => {
    const top = ai.candidates[0]
    if (!top) return showToast(translate('No AI suggestion to accept yet.'), 'error')
    if (aiDecision[top.condition_code] !== 'accepted') decideAi(top, 'accepted')
  }
  useEffect(() => {
    const onKey = (e) => {
      const alt = e.altKey && !e.ctrlKey && !e.metaKey
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        finalizeRef.current(e.shiftKey)
      } else if (alt && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        setLabOpen(true)
      } else if (alt && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        acceptTopRef.current()
      } else if (alt && e.key.toLowerCase() === 't') {
        e.preventDefault()
        document.getElementById(DRUG_SEARCH_ID)?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // In bản nháp đang kê; đơn đã chốt in lại ở Chi tiết đơn (printRx.js).
  function printRx() {
    printPrescription({ ...visit, ...d, weight: d.vitals.weight_kg, rxAt: null }, inv.drugs, user.name)
  }
  const prev = past[0]
  const vit = d.vitals

  return (
    <div className="doc-work">
      <div className="card">
        <ConsultHeader visit={visit} vit={vit} prev={prev} alerts={ai.alerts} />

        <div className="itabs" style={{ marginTop: 12 }}>
          <button className={'itab' + (tab === 'clin' ? ' active' : '')} onClick={() => setTab('clin')}>
            Consultation (SOAP)
          </button>
          <button className={'itab' + (tab === 'vitals' ? ' active' : '') + (tried && needWeight ? ' itab-err' : '')} onClick={() => setTab('vitals')}>
            Vitals
          </button>
          <button className={'itab' + (tab === 'hist' ? ' active' : '')} onClick={() => setTab('hist')}>
            History
          </button>
        </div>

        {tab === 'clin' && (
          <SoapPanel
            visit={visit}
            d={d}
            set={set}
            tried={tried}
            ai={ai}
            aiDecision={aiDecision}
            decideAi={decideAi}
            labs={
              <LabResultsEntry
                visit={visit}
                labOrders={labOrders}
                labResults={d.labResults}
                resultOf={resultOf}
                conclusionOf={conclusionOf}
                onResult={(key, value) => set({ labResults: { ...d.labResults, [key]: value } })}
                onConclusion={(id, value) => set({ labConclusions: { ...d.labConclusions, [id]: value } })}
                onCancelRow={setCancelRow}
                onSave={() => saveLabResults({ toast: true })}
                error={so.error}
              />
            }
          />
        )}

        {tab === 'vitals' && (
          <div className="ipanel active">
            <div className="section-label">Vitals for this visit</div>
            <p className="ai-soft" style={{ fontSize: 12.5, marginTop: 0 }}>
              <span>Recorded at check-in:</span> <span className="mono">{vitalsText(visit.vitals)}</span>
            </p>
            <VitalsFields
              value={d.vitals}
              onChange={setVital}
              errorKeys={tried ? new Set([...vitalErr.map((e) => e.key), ...(needWeight ? ['weight_kg'] : [])]) : new Set()}
              requireWeight={isChild(visit)}
            />
            {vitalErr.length > 0 && <p className="ai-soft" style={{ color: '#FCA5A5', fontSize: 12.5 }}>{vitalErr.map((e) => translate(e.msg)).join(' · ')}</p>}
            {isChild(visit) && <p className="ai-soft" style={{ fontSize: 12.5 }}>Children under 12: weight is required to finalize a prescription — doses are calculated per kg.</p>}
          </div>
        )}

        {tab === 'hist' && (
          <div className="ipanel active">
            <div className="section-label">Underlying conditions</div>
            <div className="symptom-box">{visit.history ? translate(visit.history) : translate('No chronic conditions on record.')}</div>
            <div className="section-label">Drug allergies</div>
            <div className="symptom-box">{visit.allergies ? translate(visit.allergies) : translate('No recorded drug allergies.')}</div>
            {/* Lịch sử khám từ server, không tính lượt đang khám. */}
            <ServerHistory patientId={visit.patientId} excludeVisitId={visit.id} />
          </div>
        )}
      </div>

      <div className="card">
        <RxEditor
          rx={d.rx}
          tried={tried}
          invDrugs={inv.drugs}
          srvDrugs={srv.drugs}
          issueOf={issueOf}
          issues={issues}
          short={short}
          last={last}
          setLine={setLine}
          setDose={setDose}
          onAdd={addDrug}
          onTemplate={applyTemplate}
          onRepeat={() => applyLines(last.rx)}
          onRemove={setDeleteTarget}
        />

        <ReminderPanel visit={visit} />
        {tried && problem && (
          <p className="ai-soft" style={{ color: '#FCD34D', fontSize: 12.5, margin: '12px 0 0' }}>
            {translate(problem)}
          </p>
        )}
        <div className="consult-footer">
          <button className="btn btn-ghost btn-sm" onClick={() => setLeaving(true)} title={translate('The patient left or refused — close the visit without an invoice')}>
            <Icon name="x" /> Patient left
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setHanding(true)} title={translate('Leaving the room? Send this patient back to the waiting queue')}>
            <Icon name="repeat" /> Return to queue
          </button>
          {/* Chuyển tuyến kết thúc lượt khám — in giấy và đóng lượt, không có hoá đơn. */}
          <button className="btn btn-ghost btn-sm" onClick={() => setDocs(true)} title={translate('Refer & end the visit')}>
            <Icon name="printer" /> Refer to hospital
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setLabOpen(true)} title="Alt+L">
            <Icon name="flask" /> Order lab tests
          </button>
          <button className="btn btn-ghost btn-sm" onClick={printRx} disabled={!d.rx.length}>
            <Icon name="printer" /> Print prescription
          </button>
          <Button className="btn btn-ghost btn-sm" disabled={finalizing} onClick={() => runFinalize(false)} title="Ctrl+Enter">
            <Icon name="check" /> Finalize
          </Button>
          <Button className="btn btn-primary btn-sm" disabled={finalizing} onClick={() => runFinalize(true)} title="Ctrl+Shift+Enter">
            <Icon name="megaphone" /> Finalize &amp; call next
          </Button>
        </div>
      </div>

      {labOpen && (
        <LabOrderModal
          open
          visit={visit}
          diagnosis={d.diagnosis}
          onClose={() => setLabOpen(false)}
          onSent={() => {
            setLabOpen(false)
            onDone()
          }}
        />
      )}
      {docs && (
        <DocumentModal
          subject={{ ...visit, ...d, rx: d.rx, labOrders }}
          mode="doctor"
          target={{ visitId: visit.id }}
          onDone={() => {
            deleteDraft(visit.id)
            onDone()
          }}
          onClose={() => setDocs(false)}
        />
      )}
      {cancelRow && (
        <CancelOrderItemModal
          item={cancelRow}
          onClose={() => setCancelRow(null)}
          onDone={() => {
            setCancelRow(null)
            so.reload()
            showToast('Order line cancelled')
          }}
        />
      )}
      {leaving && (
        <LeaveVisitModal
          visit={visit}
          onClose={() => setLeaving(false)}
          onDone={() => {
            setLeaving(false)
            onDone()
          }}
        />
      )}
      {handing && (
        <ReleaseModal
          visit={visit}
          onClose={() => setHanding(false)}
          onDone={() => {
            setHanding(false)
            onDone()
          }}
        />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        message="Are you sure you want to remove this drug from the prescription?"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          set({ rx: d.rx.filter((x) => x.id !== deleteTarget) })
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}

