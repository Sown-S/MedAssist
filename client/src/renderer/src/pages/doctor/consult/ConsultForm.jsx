import { useEffect, useRef, useState } from 'react'
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
import { updateVisit, triageOf } from '../../../api/clinicApi'
import { normalizeVitals, vitalsToForm, vitalsFromForm } from '../../../api/vitals'
import { printPrescription } from '../printRx'
import { saveDraft, deleteDraft } from '../../../api/draftStore'
import DocumentModal from '../DocumentModal'
import { ReleaseModal, LeaveVisitModal } from '../doctorShared'
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

const sameVitals = (a, b) => {
  const ka = Object.keys(a).filter((k) => a[k] != null)
  const kb = Object.keys(b).filter((k) => b[k] != null)
  return ka.length === kb.length && ka.every((k) => String(a[k]) === String(b[k]))
}

// Phiếu khám của bệnh nhân đang trong phòng: SOAP, sinh hiệu, tiền sử, kê đơn, chốt đơn / kết thúc lượt.
// Bản nháp lưu trên máy (draftStore) theo từng thay đổi.
export default function ConsultForm({ visit, user, onDone, onNext, onVisitSaved }) {
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
  // Menu "…" ở thanh thao tác (Bệnh nhân bỏ về, Trả về hàng chờ, In đơn thuốc) đóng khi bấm ra ngoài.
  const [more, setMore] = useState(false)
  const moreRef = useRef(null)
  useEffect(() => {
    if (!more) return
    const close = (e) => !moreRef.current?.contains(e.target) && setMore(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [more])
  const [docs, setDocs] = useState(false)
  const [tried, setTried] = useState(false)
  // Sinh hiệu đã gửi lên lượt khám này — mốc so sánh để chốt lại (vd sau lỗi thiếu thuốc) không gửi trùng.
  const sentVitals = useRef(null)
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

  // Danh sách triệu chứng đã xác nhận, cập nhật khi bác sĩ lưu dấu hiệu khi khám; aiRun tăng khi đã chạy lại AI.
  const [symptoms, setSymptoms] = useState(visit.symptoms ?? [])
  const [aiRun, setAiRun] = useState(0)
  const ai = useAssessment(visit, aiRun)
  function decideAi(c, decision) {
    setAiDecision((x) => ({ ...x, [c.condition_code]: decision }))
    if (decision === 'accepted') set({ diagnosis: [c.icd10_code, c.name_vi].filter(Boolean).join(' — ') })
  }
  // Đơn gần nhất trong mọi lần khám trước, kể cả lượt đã xong hôm nay.
  const last = past.find((v) => v.rx?.length)

  // Sinh hiệu đang có trên máy chủ: lần lưu gần nhất ở phiếu này, nếu chưa lưu thì sinh hiệu lúc tiếp đón.
  const savedVitals = () => (sentVitals.current?.id === visit.id ? sentVitals.current.vitals : vitalsFromForm(vitalsToForm(normalizeVitals(visit.serverVitals ?? {}))))
  const vitalsDirty = !sameVitals(vitalsFromForm(d.vitals), savedVitals())
  const [vitalsTried, setVitalsTried] = useState(false)

  // Lưu sinh hiệu ngay khi bác sĩ đo lại: máy chủ chạy lại luật (Node 1) trong cùng lần lưu và trả mức ưu tiên,
  // cờ đỏ mới → báo ngay, tải lại hàng đợi (huy hiệu Cấp cứu) và lần đánh giá mới (khung cờ đỏ ở đầu phiếu).
  async function saveVitals() {
    if (!isServerOnline()) {
      showToast(translate('No connection to the clinic server — the vitals cannot be saved now. Your notes are kept on this computer.'), 'error')
      return false
    }
    setVitalsTried(true)
    if (vitalErr.length) {
      showToast(translate('Check the vital signs') + ': ' + vitalErr.map((e) => translate(e.msg)).join('; '), 'error')
      return false
    }
    const vitalsNow = vitalsFromForm(d.vitals)
    let r
    try {
      r = await updateVisit(visit.id, { vitals: vitalsNow })
    } catch (e) {
      showToast(translate(e.message || 'Something went wrong'), 'error')
      return false
    }
    sentVitals.current = { id: visit.id, vitals: vitalsNow }
    if (r) onVisitSaved?.(r)
    setAiRun((n) => n + 1)
    syncQueue()
    const level = r?.is_red_flag ? 'emergency' : triageOf(r?.triage_priority)
    if (level === 'emergency') showToast(translate('Vitals saved') + ' · ' + translate('Red flag') + (r.red_flag_reason ? ': ' + r.red_flag_reason : ''), 'error')
    else if (level === 'high') showToast(translate('Vitals saved') + ' · ' + translate('High priority'), 'warning')
    else showToast('Vitals saved')
  }

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
      // Sinh hiệu sửa ở tab Sinh hiệu mà chưa bấm Lưu (cân nặng trẻ em in lên đơn) → lưu vào lượt khám trước khi chốt.
      const vitalsNow = vitalsFromForm(d.vitals)
      if (!sameVitals(vitalsNow, savedVitals())) {
        await updateVisit(visit.id, { vitals: vitalsNow })
        sentVitals.current = { id: visit.id, vitals: vitalsNow }
      }
      await syncDiagnoses(visit.id, { primary: d.diagnosis, extra: d.diagnosesExtra ?? [], notes: notes || null, candidates: ai.candidates, assessmentId: ai.assessment_id })
      if (mapped.length) {
        await savePrescription(
          visit.id,
          mapped.map((x) => x.item)
        )
        await confirmPrescription(visit.id)
      } else await completeExam(visit.id)
    } catch (e) {
      if (e.code === 'STOCK_SHORTAGE') {
        setShort(
          shortageOf(
            e,
            mapped.map((x) => x.line)
          )
        )
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
    <div className="doc-main">
      <ConsultHeader visit={visit} vit={vit} prev={prev} alerts={ai.alerts} onVisitSaved={onVisitSaved} />

      <div className="card">
        <div className="utabs">
          <button className={tab === 'clin' ? 'on' : ''} onClick={() => setTab('clin')}>
            Consultation (SOAP)
          </button>
          <button className={(tab === 'vitals' ? 'on' : '') + (tried && needWeight ? ' err' : '')} onClick={() => setTab('vitals')}>
            Vitals
          </button>
          <button className={tab === 'hist' ? 'on' : ''} onClick={() => setTab('hist')}>
            History
          </button>
        </div>
        <div className="card-b">
          {tab === 'clin' && (
            <SoapPanel visit={visit} symptoms={symptoms} onSymptoms={setSymptoms} onRerunAi={() => setAiRun((n) => n + 1)} d={d} set={set} tried={tried} ai={ai} aiDecision={aiDecision} decideAi={decideAi} />
          )}

          {tab === 'vitals' && (
            <VitalsTab visit={visit} vitals={d.vitals} onChange={setVital} tried={tried || vitalsTried} needWeight={tried && needWeight} vitalErr={vitalErr} dirty={vitalsDirty} onSave={saveVitals} />
          )}
          {tab === 'hist' && <HistoryTab visit={visit} />}
        </div>
      </div>

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

      <div className="card rx-card">
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

        {tried && problem && (
          <p className="small" style={{ color: 'var(--warning)', margin: '12px 0 0' }}>
            {translate(problem)}
          </p>
        )}
      </div>

      <div className="actbar">
        <div className="tb" ref={moreRef}>
          <button className="btn btn-ghost btn-icon" onClick={() => setMore(!more)} title={translate('More actions')} aria-label={translate('More actions')} aria-haspopup="menu" aria-expanded={more}>
            <Icon name="ellipsis" />
          </button>
          {more && (
            <div className="menu open" role="menu" style={{ top: 'auto', bottom: 'calc(100% + 6px)', left: 0, right: 'auto' }}>
              <button role="menuitem" onClick={() => (setMore(false), setLeaving(true))} title={translate('The patient left or refused — close the visit without an invoice')}>
                <Icon name="log-out" />
                {translate('Patient left')}
              </button>
              <button role="menuitem" onClick={() => (setMore(false), setHanding(true))} title={translate('Leaving the room? Send this patient back to the waiting queue')}>
                <Icon name="repeat" />
                {translate('Return to queue')}
              </button>
              <button role="menuitem" disabled={!d.rx.length} onClick={() => (setMore(false), printRx())}>
                <Icon name="printer" />
                {translate('Print prescription')}
              </button>
            </div>
          )}
        </div>
        <span className="sp" />
        {/* Chuyển tuyến kết thúc lượt khám — in giấy và đóng lượt, không có hoá đơn. */}
        <button className="btn btn-outline btn-sm" onClick={() => setDocs(true)} title={translate('Refer & end the visit')}>
          <Icon name="send" />
          {translate('Refer to hospital')}
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => setLabOpen(true)} title="Alt+L">
          <Icon name="flask-conical" />
          {translate('Order lab tests')}
        </button>
        <Button className="btn btn-outline btn-sm" disabled={finalizing} onClick={() => runFinalize(false)} title="Ctrl+Enter">
          <Icon name="check" /> <span>Finalize</span>
        </Button>
        <Button className="btn btn-primary btn-sm" disabled={finalizing} onClick={() => runFinalize(true)} title="Ctrl+Shift+Enter">
          <Icon name="check-check" /> <span>Finalize &amp; call next</span>
        </Button>
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
