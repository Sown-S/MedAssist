import { useEffect, useState } from 'react'
import ConfirmModal from '../../../components/ConfirmModal'
import Icon from '../../../components/Icon'
import Button from '../../../components/Button'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { syncQueue } from '../../../api/queueStore'
import { useInventory } from '../../../api/inventoryStore'
import LabOrderModal from '../LabOrderModal'
import { useAssessment } from '../AssessmentCard'
import { useServiceOrders } from '../../../api/serviceStore'
import CancelOrderItemModal from '../../../components/CancelOrderItemModal'
import { useServerDrugs, reloadServerDrugs } from '../../../api/serverDrugs'
import { syncDiagnoses, savePrescription, confirmPrescription, completeExam, shortageOf } from '../../../api/examApi'
import { isServerOnline } from '../../../api/connectivity'
import { printPrescription } from '../printRx'
import { saveDraft, deleteDraft } from '../../../api/draftStore'
import DocumentModal from '../DocumentModal'
import { ReleaseModal, LeaveVisitModal } from '../doctorShared'
import { ReminderPanel } from './ReminderPanel'
import { serverStockIssue, serverItem, draftOf } from './rxDraft'
import { usePastVisits } from './usePastVisits'
import ConsultHeader from './ConsultHeader'
import LabResultsEntry from './LabResultsEntry'
import RxEditor from './RxEditor'
import SoapPanel from './SoapPanel'
import { VitalsTab, HistoryTab } from './ConsultTabs'
import { useRxLines } from './useRxLines'
import { useConsultShortcuts } from './useConsultShortcuts'
import { useLabResults } from './useLabResults'
import { finalizeCheck, clinicalNotes } from './finalizeCheck'

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

  const set = (patch) => setD((x) => ({ ...x, ...patch }))
  const setVital = (k, v) => setD((x) => ({ ...x, vitals: { ...x.vitals, [k]: v } }))
  const { setLine, setDose, addDrug, applyLines, applyTemplate } = useRxLines({ d, set, setD, srvDrugs: srv.drugs, invDrugs: inv.drugs })
  const { labOrders, resultOf, conclusionOf, saveLabResults } = useLabResults({ visit, d, set, so })
  useEffect(() => {
    saveDraft(visit.id, d)
  }, [visit.id, d])

  const ai = useAssessment(visit)
  function decideAi(c, decision) {
    setAiDecision((x) => ({ ...x, [c.condition_code]: decision }))
    if (decision === 'accepted') set({ diagnosis: [c.icd10_code, c.name_vi].filter(Boolean).join(' — ') })
  }
  // Đơn gần nhất trong mọi lần khám trước, kể cả lượt đã xong hôm nay.
  const last = past.find((v) => v.rx?.length)

  const issues = d.rx.map((it) => ({ it, issue: issueOf(it) })).filter((x) => x.issue && x.issue.level !== 'info')
  const { problem, needWeight, vitalErr } = finalizeCheck(visit, d)

  // Đồng bộ chẩn đoán → lưu đơn nháp → xác nhận. Thiếu thuốc (409 STOCK_SHORTAGE) → liệt kê từng thuốc,
  // chẩn đoán đã lưu giữ nguyên, chốt lại được.
  async function finalizeOnServer(andNext) {
    const mapped = d.rx.map((l) => serverItem(l, srv.drugs))
    const bad = mapped.find((x) => x.error)
    if (bad) return showToast(bad.error, 'error')
    // Kết quả cận lâm sàng lưu ở phiếu chỉ định — ghi trước khi chốt.
    if (!(await saveLabResults())) return
    const notes = clinicalNotes(d)
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
  useConsultShortcuts({
    finalize: runFinalize,
    openLab: () => setLabOpen(true),
    acceptTop: () => {
      const top = ai.candidates[0]
      if (!top) return showToast(translate('No AI suggestion to accept yet.'), 'error')
      if (aiDecision[top.condition_code] !== 'accepted') decideAi(top, 'accepted')
    }
  })

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

        {tab === 'vitals' && <VitalsTab visit={visit} vitals={d.vitals} onChange={setVital} tried={tried} needWeight={needWeight} vitalErr={vitalErr} />}
        {tab === 'hist' && <HistoryTab visit={visit} />}
      </div>

      <div className="card">
        <RxEditor
          rx={d.rx}
          tried={tried}
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

