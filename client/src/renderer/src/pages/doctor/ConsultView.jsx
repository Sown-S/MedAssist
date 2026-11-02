import { useEffect, useRef, useState } from 'react'
import ICDPicker from '../../components/ICDPicker'
import ConfirmModal from '../../components/ConfirmModal'
import PatientAlerts from '../../components/PatientAlerts'
import DrugPicker from '../../components/DrugPicker'
import Icon from '../../components/Icon'
import Button from '../../components/Button'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { translate } from '../../i18n'
import { useQueue, waitingOrder, readyOrder, ST, inRoom, atLabs, minutesSince, labOrderSummary, labRows, isMine, syncQueue } from '../../api/queueStore'
import { useInventory, findDrugByName } from '../../api/inventoryStore'
import { controlledKind, CONTROLLED_LABEL } from '../../api/rxSafety'
import { unitLabel } from '../admin/inventory/shared'
import { useNow, dmy, hhmm } from '../reception/shared'
import LabOrderModal, { printLabOrder } from './LabOrderModal'
import AssessmentCard, { useAssessment } from './AssessmentCard'
import { putServiceResults } from '../../api/serviceApi'
import { useServiceOrders, toLabOrder, apiMessage } from '../../api/serviceStore'
import CancelOrderItemModal from '../../components/CancelOrderItemModal'
import { useServerDrugs, reloadServerDrugs, findServerDrug } from '../../api/serverDrugs'
import { syncDiagnoses, savePrescription, confirmPrescription, completeExam, shortageOf } from '../../api/examApi'
import { isServerOnline } from '../../api/connectivity'
import ServerHistory from './ServerHistory'
import { printPrescription } from './printRx'
import { saveDraft, deleteDraft } from '../../api/draftStore'
import DocumentModal from './DocumentModal'
import VitalsFields from '../../components/VitalsFields'
import { vitalsText, checkVitals } from '../../api/vitals'
import { useTakePatient, ReleaseModal, LeaveVisitModal, InviteBar } from './doctorShared'
import { getHistory } from '../../api/emrApi'
import { ClinicalInfoEditor } from './consult/ClinicalInfoEditor'
import { SecondaryDx } from './consult/SecondaryDx'
import { ConfirmedSymptoms } from './consult/ConfirmedSymptoms'
import { ReminderPanel } from './consult/ReminderPanel'
import { ServerVisit } from './consult/ServerVisit'
import { RX, drugForTemplate, SLOTS, MEALS, blankDose, num, perDay, unitVi, usageOf, serverStockIssue, nextLineId, lineOf, serverItem, draftOf } from './consult/rxDraft'

// Đơn mẫu: một lần bấm thêm cả nhóm thuốc.
const TEMPLATES = [
  { key: 'throat', title: 'Pharyngitis / tonsillitis' },
  { key: 'gastric', title: 'Gastric pain' },
  { key: 'diabetes', title: 'Type 2 diabetes' },
  { key: 'rash', title: 'Allergic rash' },
  { key: 'pain', title: 'Pain relief' }
]
// Cách dùng gợi ý cho thuốc dùng khi cần — viết tiếng Việt vì đơn in cho bệnh nhân.
const USAGES = ['Uống khi sốt trên 38,5°C, cách nhau ít nhất 4–6 giờ', 'Uống khi đau, sau ăn, tối đa 3 lần/ngày', 'Uống trước ăn sáng 30 phút', 'Bôi ngày 2 lần lên vùng da tổn thương']
const STATUS_CHIP = { waiting: 'WAITING', in_exam: 'IN CONSULTATION', labs: 'WAITING FOR LABS' }

// Lý do bị chặn khi trừ kho lúc chốt đơn (INSUFFICIENT_STOCK).
const SHORT_REASON = {
  out: 'Out of stock',
  expiring: 'In stock, but the batches expire before the course ends',
  inactive: 'Discontinued in the drug catalog'
}

const DRUG_SEARCH_ID = 'consult-drug-search'

// Trẻ dưới 12 tuổi: liều tính theo cân nặng → bắt buộc có cân nặng mới chốt đơn.
const isChild = (v) => v.age !== '' && v.age != null && Number(v.age) < 12

// Cột hàng đợi chia nhóm, thu gọn được; trạng thái nhớ theo máy.
const GROUPS_KEY = 'medassist_doc_queue_groups'
const DEFAULT_OPEN = { mine: true, labs: true, waiting: true, done: false, other: false, _rail: false }
function readOpen() {
  try {
    return { ...DEFAULT_OPEN, ...JSON.parse(localStorage.getItem(GROUPS_KEY)) }
  } catch {
    return DEFAULT_OPEN
  }
}
const GROUP_ICON = { mine: 'stethoscope', labs: 'flask', waiting: 'users', done: 'check', other: 'user' }

export default function ConsultView({ visitId, onSelect }) {
  const { user } = useAuth()
  const { visits } = useQueue()
  const now = useNow()
  const [openGroups, setOpenGroups] = useState(readOpen)
  const [closing, setClosing] = useState(null)
  const { take, next, dialog } = useTakePatient(onSelect)
  const mine = visits.filter((v) => inRoom(v) && isMine(v, user))
  const current = visits.find((v) => v.id === visitId && inRoom(v) && isMine(v, user)) ?? mine[0] ?? null

  function toggle(key) {
    const nextOpen = { ...openGroups, [key]: !openGroups[key] }
    setOpenGroups(nextOpen)
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(nextOpen))
    } catch {/* không lưu được thì chỉ nhớ trong phiên */}
  }

  const nextRef = useRef(next)
  nextRef.current = next
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        nextRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const groups = [
    { key: 'mine', title: 'In my room', list: mine },
    { key: 'labs', title: 'Out for lab tests', list: visits.filter(atLabs) },
    // Người đã check-in (mời được) đứng trước người chưa check-in.
    { key: 'waiting', title: 'Waiting', list: [...readyOrder(visits), ...waitingOrder(visits).filter((v) => v.status === ST.WAITING)] },
    {
      key: 'done',
      title: 'Done today',
      list: visits.filter((v) => (v.status === ST.PRESCRIBED || v.status === ST.FINISHED) && isMine(v, user)).sort((a, b) => b.statusAt.localeCompare(a.statusAt))
    },
    { key: 'other', title: 'With other doctors', list: visits.filter((v) => inRoom(v) && !isMine(v, user)) }
  ]

  function onItem(g, v) {
    if (g.key === 'mine') return onSelect(v.id)
  }

  const rail = openGroups._rail
  return (
    <div className={'doc-layout' + (rail ? ' q-rail' : '')}>
      {rail ? (
        <div className="card dq-rail">
          <button className="icon-btn" onClick={() => toggle('_rail')} title={translate('Show the queue')}>
            <Icon name="chevronsRight" />
          </button>
          <button className="icon-btn primary" onClick={next} title={translate('Call next patient') + ' (Alt+N)'}>
            <Icon name="megaphone" />
          </button>
          {groups.slice(0, 3).map((g) => (
            <button key={g.key} className="dq-rail-cnt" onClick={() => toggle('_rail')} title={translate(g.title)}>
              <Icon name={GROUP_ICON[g.key]} />
              <b>{g.list.length}</b>
            </button>
          ))}
        </div>
      ) : (
        <div className="card dq">
          <div className="dq-top">
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={next} title="Alt+N">
              <Icon name="megaphone" /> Call next patient
            </button>
            <button className="icon-btn" onClick={() => toggle('_rail')} title={translate('Collapse the queue')}>
              <Icon name="chevronsLeft" />
            </button>
          </div>
          <InviteBar compact onStart={take} />
          {mine.length > 0 && <p className="dq-note">Finish or send the current patient for lab tests before calling the next one.</p>}
          {groups.map((g) => {
            const on = openGroups[g.key]
            return (
              <div key={g.key} className={'dq-group' + (on ? ' open' : '')}>
                <button className="dq-h" onClick={() => toggle(g.key)} aria-expanded={on}>
                  <span>{g.title}</span> <span className="cnt">{g.list.length}</span>
                  <Icon name="chevronDown" />
                </button>
                <div className="collapse">
                  <div>
                    {g.list.map((v) => {
                      const n = minutesSince(v.statusAt, now)
                      const active = current?.id === v.id
                      const clickable = g.key === 'mine' || (g.key === 'done' && v.rx.length > 0)
                      return (
                        <div
                          key={v.id}
                          className={'dq-item' + (active ? ' active' : '') + (g.key === 'other' ? ' muted' : '') + (g.key === 'done' ? ' done' : '') + (clickable ? '' : ' static')}
                          onClick={() => onItem(g, v)}
                          title={g.key === 'done' && v.rx.length ? translate('View & review the prescription') : undefined}
                        >
                          <span className="dq-no">{String(v.ticket).padStart(3, '0')}</span>
                          <div className="dq-main">
                            <b>{v.name}</b>
                            <small>
                              {g.key === 'done' ? (
                                v.diagnosis || '—'
                              ) : (
                                <>
                                  {translate(v.gender)}
                                  {v.age !== '' ? ', ' + v.age : ''} · {translate(v.reason)}
                                </>
                              )}
                            </small>
                            <span className="dq-tags">
                              {v.triage === 'emergency' && g.key !== 'done' && <span className="badge low">{translate('Emergency')}</span>}
                              {v.priority && v.triage !== 'emergency' && g.key !== 'done' && <span className="dot warn" title={translate('Priority')} />}
                              {v.allergies && <span className="dot danger" title={translate('Allergy') + ': ' + translate(v.allergies)} />}
                              {g.key === 'labs' && v.labReturnedAt && (
                                <span className="dq-back">
                                  <Icon name="flask" /> {translate('Back from lab')}
                                </span>
                              )}
                              {g.key === 'waiting' && v.status === ST.WAITING && <span className="badge muted">{translate('Not checked in')}</span>}
                              {v.released && g.key === 'waiting' && (
                                <span className="dq-handover" title={translate('Returned to the queue by') + ' ' + v.released.by}>
                                  <Icon name="repeat" /> {translate('Returned to queue')}
                                </span>
                              )}
                              {g.key === 'done' ? (
                                <span className="ai-soft">
                                  {hhmm(v.statusAt)} · {v.rx.length} {translate(v.rx.length === 1 ? 'drug' : 'drugs')}
                                </span>
                              ) : (
                                <span className={'p-wait ' + (n >= 45 ? 'long' : n >= 25 ? 'warn' : 'ok')}>{n} min</span>
                              )}
                              {(g.key === 'other' || (g.key === 'labs' && !isMine(v, user))) && <span className="ai-soft">{v.doctor}</span>}
                            </span>
                          </div>
                          {g.key === 'labs' && isMine(v, user) && !v.labReturnedAt && minutesSince(v.statusAt, now) >= 60 && (
                            <button
                              className="icon-btn sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                setClosing(v)
                              }}
                              title={translate('Did not come back — close the visit')}
                            >
                              <Icon name="x" />
                            </button>
                          )}
                          {((g.key === 'waiting' && v.status === ST.CHECKED_IN) || (g.key === 'labs' && isMine(v, user))) && (
                            <button
                              className={'btn btn-sm ' + (v.labReturnedAt ? 'btn-primary' : 'btn-ghost')}
                              onClick={(e) => {
                                e.stopPropagation()
                                take(v)
                              }}
                              title={translate('Call into the room')}
                            >
                              {g.key === 'labs' ? 'Resume' : 'Call in'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {!g.list.length && <p className="dq-empty">{translate('No one here.')}</p>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {current ? (
        <ServerVisit key={current.id} visit={current}>
          {(v) => <ConsultForm key={v.id} visit={v} user={user} onDone={() => onSelect(null)} onNext={next} />}
        </ServerVisit>
      ) : (
        <div className="card doc-empty">
          <div className="empty-state">
            <Icon name="stethoscope" />
            <b>No patient in your room</b>
            <span>Call the next patient, or pick someone from the queue on the left.</span>
            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={next} disabled={!waitingOrder(visits).length}>
              <Icon name="megaphone" /> Call next patient
            </button>
          </div>
        </div>
      )}
      {closing && <LeaveVisitModal visit={closing} onClose={() => setClosing(null)} onDone={() => setClosing(null)} />}
      {dialog}
    </div>
  )
}

// Các lần khám trước của bệnh nhân (GET /patients/{id}/history, mới nhất trước), đổi về dạng dòng mà phiếu khám dùng:
// "Lần khám trước" và nút lặp lại đơn gần nhất.
const historyItem = (x) => {
  const dx = x.diagnoses.find((g) => g.is_primary) ?? x.diagnoses[0]
  return {
    id: x.visit_id,
    statusAt: x.visit_date,
    rxAt: x.prescription?.confirmed_at ?? null,
    diagnosis: dx ? [dx.icd10_code, dx.diagnosis_name].filter(Boolean).join(' — ') : '',
    rx: (x.prescription?.items ?? []).map((l) => ({ name: l.drug_label, qty: l.quantity, unit: l.unit, usage: `${l.dosage} — ${l.frequency} — ${l.duration_days} ngày` }))
  }
}
function usePastVisits(visit) {
  const [past, setPast] = useState([])
  useEffect(() => {
    let alive = true
    getHistory(visit.patientId, { limit: 10 }).then(
      (h) => alive && setPast(h.items.filter((x) => x.visit_id !== visit.id).map(historyItem)),
      () => {}
    )
    return () => {
      alive = false
    }
  }, [visit.patientId, visit.id])
  return past
}

function ConsultForm({ visit, user, onDone, onNext }) {
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
  const followIn = (days) => {
    const x = new Date()
    x.setDate(x.getDate() + days)
    set({ followUp: [x.getFullYear(), x.getMonth() + 1, x.getDate()].map((n, i) => (i ? String(n).padStart(2, '0') : n)).join('-') })
  }
  const prev = past[0]
  const vit = d.vitals

  return (
    <div className="doc-work">
      <div className="card">
        <div className="consult-head">
          <div>
            <h2>
              <span className="p-ticket" style={{ marginRight: 8 }}>
                {String(visit.ticket).padStart(3, '0')}
              </span>
              {visit.name}
            </h2>
            <div className="sub">
              {translate(visit.gender)}
              {visit.age !== '' ? ' · ' + visit.age + ' ' + translate('yrs') : ''} · <span className="mono">{visit.patientCode ?? visit.patientId}</span> · <span className="mono">{visit.phone}</span>
            </div>
          </div>
          <span className="status-chip">{STATUS_CHIP[visit.status]}</span>
        </div>

        <div className="consult-strip">
          <span>
            <small>Pulse</small>
            <b className="mono">{vit.heart_rate_bpm || '—'}</b>
          </span>
          <span>
            <small>BP</small>
            <b className="mono">{vit.systolic_bp_mmhg ? vit.systolic_bp_mmhg + '/' + (vit.diastolic_bp_mmhg || '—') : '—'}</b>
          </span>
          <span className={num(vit.temperature_c) >= 38.5 ? 'hot' : ''}>
            <small>Temp</small>
            <b className="mono">{vit.temperature_c ? vit.temperature_c + '°C' : '—'}</b>
          </span>
          <span className={vit.spo2_pct && num(vit.spo2_pct) < 94 ? 'hot' : ''}>
            <small>SpO2</small>
            <b className="mono">{vit.spo2_pct ? vit.spo2_pct + '%' : '—'}</b>
          </span>
          <span className={isChild(visit) && !(num(vit.weight_kg) > 0) ? 'need' : ''}>
            <small>Body weight</small>
            <b className="mono">{vit.weight_kg ? vit.weight_kg + ' kg' : isChild(visit) ? translate('required') : '—'}</b>
          </span>
          <span className="wide">
            <small>Last visit</small>
            <b>{prev ? dmy(prev.rxAt ?? prev.statusAt) + ' · ' + (prev.diagnosis || '—') : translate('First visit')}</b>
          </span>
        </div>

        {visit.returnNote && (
          <div className="warn-banner show caution" style={{ margin: '10px 0' }}>
            <div className="icon">
              <Icon name="alert" />
            </div>
            <div className="txt">
              <b>
                {translate('Sent back by')} {visit.returnNote.by} · {hhmm(visit.returnNote.at)} — {translate('not enough stock, please change these drugs')}
              </b>
              {visit.returnNote.text}
            </div>
          </div>
        )}
        {ai.alerts.map((f) => (
          <div key={f.rule_key} className="warn-banner show danger" style={{ margin: '10px 0' }}>
            <div className="icon">
              <Icon name="ban" />
            </div>
            <div className="txt">
              <b>{translate(f.rule_type === 'RED_FLAG' ? 'Red flag' : 'Priority')}</b>
              {f.reason_text}
            </div>
          </div>
        ))}
        <PatientAlerts p={visit} />
        <ClinicalInfoEditor visit={visit} />

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
          <div className="ipanel active">
            <div className="section-label">S — Subjective · Chief complaint / reported symptoms</div>
            <div className="symptom-box">
              <small className="ai-soft">{translate('At check-in')}:</small> {translate(visit.reason)}
              <ConfirmedSymptoms list={visit.symptoms} />
            </div>
            <textarea
              className="doc-ta"
              rows="2"
              style={{ marginTop: 6 }}
              value={d.hpi}
              onChange={(e) => set({ hpi: e.target.value })}
              placeholder="History of present illness — onset, course, medicines already taken…"
            />
            {labOrders.length > 0 && (
              <>
                <div className="section-label">Lab tests ordered · results from the paper report</div>
                {labOrders.map((o) => (
                  <div key={o.id} className="symptom-box lab-entry">
                    <div className="lab-ordered">
                      <div>
                        <b>{labOrderSummary(o)}</b>
                        <small>
                          {hhmm(o.at)} · {o.by}
                          {o.note ? ' · ' + o.note : ''}
                        </small>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => printLabOrder(visit, o)}>
                        <Icon name="printer" /> Reprint
                      </button>
                    </div>
                    {labRows(o).map((r) =>
                      r.cancelled ? (
                        <div key={r.key} className="lab-entry-row ai-dim">
                          <span>
                            <s>{r.name}</s>
                          </span>
                          <small className="ai-soft">{translate('Cancelled — not done')}</small>
                        </div>
                      ) : (
                        <label key={r.key} className="lab-entry-row">
                          <span>
                            {r.name}
                            {r.ref && <small className="ai-soft"> · {r.ref}</small>}
                          </span>
                          <input
                            type="text"
                            value={resultOf(r)}
                            onChange={(e) => set({ labResults: { ...d.labResults, [r.key]: e.target.value } })}
                            placeholder="Result, e.g. 13.2 G/L (high)"
                          />
                          {!r.result && !(d.labResults[r.key] ?? '').trim() && (
                            <button type="button" className="btn btn-ghost btn-sm" title={translate('The patient did not have this done')} onClick={() => setCancelRow(r)}>
                              <Icon name="x" />
                            </button>
                          )}
                        </label>
                      )
                    )}
                    <textarea
                      className="doc-ta"
                      rows="2"
                      style={{ marginTop: 6 }}
                      value={conclusionOf(o)}
                      onChange={(e) => set({ labConclusions: { ...d.labConclusions, [o.id]: e.target.value } })}
                      placeholder="Conclusion of this order, e.g. Raised inflammatory markers…"
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => saveLabResults({ toast: true })}>
                    <Icon name="save" /> Save lab results
                  </button>
                </div>
              </>
            )}
            {so.error && <p className="ai-soft">{so.error}</p>}

            <div className="section-label">O — Objective · Physical examination</div>
            <textarea className="doc-ta" rows="3" value={d.exam} onChange={(e) => set({ exam: e.target.value })} placeholder="Findings on examination…" />

            <AssessmentCard a={ai} decisions={aiDecision} onAccept={(c) => decideAi(c, 'accepted')} onDismiss={(c) => decideAi(c, 'dismissed')} />

            <div className="section-label">
              Confirmed diagnosis (ICD-10 code) <span className="req">*</span>
            </div>
            <div className={tried && !d.diagnosis.trim() ? 'field-error' : ''}>
              <ICDPicker value={d.diagnosis} onChange={(v) => set({ diagnosis: v })} />
            </div>
            <SecondaryDx list={d.diagnosesExtra} onChange={(diagnosesExtra) => set({ diagnosesExtra })} />

            <div className="section-label">P — Plan · Treatment plan &amp; advice</div>
            <textarea className="doc-ta" rows="2" value={d.plan} onChange={(e) => set({ plan: e.target.value })} placeholder="e.g. Rest, drink plenty of water, come back if the fever lasts more than 3 days…" />
            <div className="follow-up">
              <label>
                <Icon name="calendar" /> <span>Follow-up visit</span>
              </label>
              <input type="date" value={d.followUp} onChange={(e) => set({ followUp: e.target.value })} />
              {[3, 7, 14, 30].map((n) => (
                <button key={n} className="chip-btn" onClick={() => followIn(n)}>
                  +{n} {translate('days')}
                </button>
              ))}
              {d.followUp && (
                <button className="chip-btn" onClick={() => set({ followUp: '' })}>
                  <Icon name="x" /> <span>None</span>
                </button>
              )}
            </div>
          </div>
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
        <div className="card-title" style={{ marginBottom: 8 }}>
          <Icon name="clipboard" /> Prescription <span className="cnt">{d.rx.length}</span>
        </div>
        <DrugPicker onPick={addDrug} drugs={srv.drugs} inputId={DRUG_SEARCH_ID} title="Alt+T" />
        <div className="rx-quick">
          <span className="ai-soft">Templates:</span>
          {TEMPLATES.map((t) => (
            <button key={t.key} className="chip-btn" onClick={() => applyTemplate(t.key)}>
              {t.title}
            </button>
          ))}
          {last && (
            <button className="chip-btn accent" onClick={() => applyLines(last.rx)} title={dmy(last.rxAt)}>
              <Icon name="repeat" /> Repeat last prescription
            </button>
          )}
        </div>
        <p className="ai-soft" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Reference templates — the doctor adjusts the drugs, doses and duration for each patient.
        </p>

        {d.rx.length > 0 ? (
          <div className="rx-lines">
            {d.rx.map((it) => {
              const issue = issueOf(it)
              const bad = tried && (!(parseInt(it.qty) > 0) || !it.usage.trim())
              const daily = perDay(it.dose)
              return (
                <div className={'rx-line' + (bad ? ' bad' : '')} key={it.id}>
                  <div className="rx-line-top">
                    <b>{it.name}</b>
                    {controlledKind(findDrugByName(it.name, inv.drugs)) && (
                      <span className="badge low" title={translate('Printed on a separate prescription')}>
                        {translate(CONTROLLED_LABEL[controlledKind(findDrugByName(it.name, inv.drugs))])}
                      </span>
                    )}
                    <label className="rx-ess" title={translate('Reception warns the patient if they decide not to buy this drug')}>
                      <input type="checkbox" checked={it.essential} onChange={() => setLine(it.id, { essential: !it.essential })} /> <span>Must buy — warn reception</span>
                    </label>
                    <button className="icon-btn sm danger" title={translate('Remove')} onClick={() => setDeleteTarget(it.id)}>
                      <Icon name="x" />
                    </button>
                  </div>
                  <div className="rx-dose">
                    {SLOTS.map(([k, label]) => (
                      <label key={k}>
                        <small>{label}</small>
                        <input type="text" inputMode="decimal" value={it.dose?.[k] ?? ''} onChange={(e) => setDose(it, { [k]: e.target.value })} placeholder="0" />
                      </label>
                    ))}
                    <label>
                      <small>Days</small>
                      <input type="text" inputMode="numeric" value={it.dose?.days ?? ''} onChange={(e) => setDose(it, { days: e.target.value })} placeholder="7" />
                    </label>
                    <label className="meal">
                      <small>When</small>
                      <select value={it.dose?.meal ?? 'after'} onChange={(e) => setDose(it, { meal: e.target.value })}>
                        {MEALS.map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {daily > 0 && (
                      <span className="rx-daily">
                        {daily} {unitVi(it.unit)}/{translate('day')}
                      </span>
                    )}
                  </div>
                  <div className="rx-line-fields">
                    <span className="rx-qty">
                      <input type="number" min="1" placeholder="Qty" value={it.qty} onChange={(e) => setLine(it.id, { qty: e.target.value })} />
                      <span className="ai-soft">{unitLabel(it.unit)}</span>
                    </span>
                    <input className="rx-usage" type="text" list="rx-usages" placeholder="Directions — filled in from the dose above, or type for “as needed” drugs" value={it.usage} onChange={(e) => setLine(it.id, { usage: e.target.value })} />
                  </div>
                  {issue && (
                    <div className={'rx-stock ' + issue.level}>
                      <Icon name="alert" /> <span>{issue.text}</span>
                      {issue.usable != null && (
                        <>
                          {' '}
                          (<span>only</span> <span className="mono">{issue.usable}</span> <span>{unitLabel(issue.unit)}</span>)
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            <datalist id="rx-usages">
              {USAGES.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '22px 10px' }}>
            <Icon name="clipboard" />
            <b>No drugs yet</b>
            <span>Search the catalog, pick a template or repeat the last prescription. A visit can also be completed without drugs.</span>
          </div>
        )}

        {short?.length > 0 && (
          <div className="warn-banner danger show">
            <div className="icon">
              <Icon name="ban" />
            </div>
            <div className="txt">
              <b>{translate('Confirmation blocked — not enough usable stock')}</b>
              {short.map((x) => (
                <div key={x.key}>
                  <span>{x.name}</span> — <span>{translate(SHORT_REASON[x.reason] ?? x.reason)}</span> ({translate('needs')} <b className="mono">{x.need}</b>, {translate('usable')} <b className="mono">{x.usable}</b>)
                </div>
              ))}
            </div>
          </div>
        )}
        {issues.length > 0 && (
          <div className="warn-banner danger show">
            <div className="icon">
              <Icon name="box" />
            </div>
            <div className="txt">
              <b>Stock problem</b>
              {issues.map(({ it, issue }) => (
                <div key={it.id}>
                  <span>{it.name}</span> — <span>{issue.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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

