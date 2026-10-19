"""Hàng đợi đánh giá AI trên PostgreSQL (Kế hoạch v7, Sprint 3) — phần của Sơn.

Luồng:
1. ``enqueue_assessment()`` — API đánh giá (của Huy) gọi trong transaction của request.
   - Chụp đặc trưng đầu vào ĐÃ XÁC NHẬN (visit_symptom + sinh hiệu + tuổi) vào ``input_features``.
   - Chạy Node 1 (cổng cờ đỏ) ĐỒNG BỘ: cờ đỏ phải hiện ngay cả khi worker hay LLM đang chết.
     Cờ đỏ -> lần chạy kết thúc luôn (Skipped/RuleOnly), không xếp hàng.
   - Không cờ đỏ -> trạng thái Queued; các lần Queued cũ của cùng lượt khám bị thay thế.
2. Worker (``app.worker``): ``claim_next()`` lấy việc bằng ``FOR UPDATE SKIP LOCKED`` + lease;
   ``sweep_expired()`` thu hồi lease quá hạn (worker chết giữa chừng).
3. Worker ghi gợi ý sơ bộ (``write_preliminary``) rồi kết quả cuối (``write_result``) hoặc lỗi
   (``write_failure``). Chỉ lần chạy MỚI NHẤT của lượt khám được cập nhật lượt khám.
4. Trích xuất triệu chứng (FR12): ``enqueue_extraction()`` xếp hàng ``run_type='Extraction'``, worker
   lấy trước Assessment (y tá đang chờ, ngân sách 30 giây), ghi gợi ý bằng ``write_extraction()``.
   Gợi ý chỉ nằm trong nhật ký AI; y tá xác nhận qua PUT /visits/{id}/symptoms. Không đổi visit.ai_status.

Ánh xạ trạng thái (chốt 18/10): Completed -> visit Ready / log Completed; Preliminary -> visit
Preliminary / log Running; Degraded, Skipped giữ nguyên; lỗi hạ tầng -> Failed.

Nhật ký AI không chứa thông tin định danh: input_features chỉ có mã triệu chứng, sinh hiệu, tuổi.
"""
import datetime
import json
import uuid
from typing import Any

from sqlalchemy import case, func, select, text, update
from sqlalchemy.orm import Session

from app.ai.interfaces import KnowledgeReader
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.core.config import settings
from app.exceptions import AppError
from app.models import AiAssessmentLog, Patient, User, Visit, VisitSymptom
from app.models.user import SYSTEM_USER_ID
from app.services import audit_service as audit
from app.services.queue_service import get_visit

ASSESSABLE_STATUSES = ("Waiting", "CheckedIn", "Examining")
_VISIT_STATUS = {"Completed": "Ready", "Degraded": "Degraded", "Skipped": "Skipped"}


# ============================================================================ đặc trưng đầu vào
def _age(dob: datetime.date, on: datetime.date) -> tuple[int, int]:
    months = (on.year - dob.year) * 12 + (on.month - dob.month) - (1 if on.day < dob.day else 0)
    months = max(months, 0)
    return months // 12, months


def build_input_features(db: Session, visit: Visit) -> dict[str, Any]:
    """Đặc trưng ĐÃ XÁC NHẬN, không có thông tin định danh (ERD: ai_assessment_log.input_features)."""
    symptoms = dict(db.execute(select(VisitSymptom.symptom_code, VisitSymptom.state)
                               .where(VisitSymptom.visit_id == visit.visit_id)
                               .order_by(VisitSymptom.symptom_code)).all())
    dob = db.scalar(select(Patient.date_of_birth).where(Patient.patient_id == visit.patient_id))
    age_years, age_months = _age(dob, visit.visit_date.date())
    return {"symptoms": symptoms, "vital_signs": dict(visit.vital_signs or {}),
            "age_years": age_years, "age_months": age_months}


# ============================================================================ cờ đỏ / mức ưu tiên
def _enrich_hits(hits: list[dict], rules: list[dict]) -> list[dict]:
    """Bổ sung rule_type và triage_rule_id (cần cho FK visit.red_flag_rule_id) vào từng luật khớp."""
    by_key = {(r["rule_key"], r["version"]): r for r in rules}
    out = []
    for hit in hits:
        rule = by_key.get((hit.get("rule_key"), hit.get("version")), {})
        out.append({**hit, "rule_type": rule.get("rule_type"), "triage_rule_id": rule.get("triage_rule_id")})
    return out


def _apply_triage(visit: Visit, *, is_red_flag: bool, hits: list[dict], priority_rule: str,
                  priority_final: str) -> None:
    """Ghi cờ đỏ + hai mức ưu tiên vào lượt khám trong MỘT lần gán (các CHECK của visit kiểm cả bộ)."""
    red = next((h for h in hits if h.get("rule_type") == "RED_FLAG"), None) if is_red_flag else None
    if is_red_flag and (red is None or not red.get("triage_rule_id")):
        raise RuntimeError("Cờ đỏ nhưng không xác định được luật RED_FLAG đã khớp")
    visit.is_red_flag = red is not None
    visit.red_flag_rule_id = uuid.UUID(red["triage_rule_id"]) if red else None
    visit.red_flag_reason = red.get("reason") if red else None
    visit.triage_priority_rule = priority_rule
    visit.triage_priority = priority_final
    visit.priority_raised_by_ai = priority_rule == "Routine" and priority_final == "HighPriority"
    visit.updated_at = func.now()


# ============================================================================ 1. xếp hàng
def enqueue_assessment(db: Session, visit_id: uuid.UUID, actor: User,
                       reader: KnowledgeReader) -> AiAssessmentLog:
    """Tạo một lần đánh giá cho lượt khám. Bên gọi commit. Trả dòng nhật ký (Queued hoặc Skipped)."""
    visit = db.scalar(select(Visit).where(Visit.visit_id == visit_id).with_for_update())
    if visit is None:
        get_visit(db, visit_id)
    if visit.status not in ASSESSABLE_STATUSES:
        raise AppError(409, "VISIT_CLOSED", "Lượt khám đã kết thúc, không chạy đánh giá AI",
                       [{"current": visit.status}])

    features = build_input_features(db, visit)
    if hasattr(reader, "refresh"):
        reader.refresh()
    gate = run_node1({"input_features": features}, reader)
    hits = _enrich_hits(gate["rule_hits"], reader.active_triage_rules())
    release_id = reader.active_release().get("release_id")

    # Lần Queued cũ của cùng lượt khám không còn đúng đặc trưng mới nhất -> thay thế
    db.execute(update(AiAssessmentLog)
               .where(AiAssessmentLog.visit_id == visit_id, AiAssessmentLog.run_type == "Assessment",
                      AiAssessmentLog.status == "Queued")
               .values(status="Skipped", error_detail="SUPERSEDED", completed_at=func.now()))

    run = AiAssessmentLog(
        visit_id=visit_id, run_type="Assessment", triggered_by=actor.user_id,
        input_features=features, rule_hits=hits,
        priority_rule=gate["priority_rule"], priority_final=gate["priority_final"],
        knowledge_release_id=uuid.UUID(release_id) if release_id else None,
        status="Queued")
    if gate["is_red_flag"]:
        run.status, run.mode, run.candidates, run.completed_at = "Skipped", "RuleOnly", [], func.now()
    db.add(run)

    _apply_triage(visit, is_red_flag=gate["is_red_flag"], hits=hits,
                  priority_rule=gate["priority_rule"], priority_final=gate["priority_final"])
    visit.ai_status = "Skipped" if gate["is_red_flag"] else "Pending"
    db.flush()
    audit.record(db, action="CREATE", entity="ai_assessment_log", entity_id=run.assessment_id,
                 actor_id=actor.user_id,
                 new_values={"visit_id": str(visit_id), "status": run.status,
                             "is_red_flag": gate["is_red_flag"], "rule_hits": [h["rule_key"] for h in hits]})
    return run


def enqueue_extraction(db: Session, visit_id: uuid.UUID, actor: User) -> AiAssessmentLog:
    """Xếp hàng trích xuất triệu chứng từ visit.free_text_description. Bên gọi commit."""
    visit = db.scalar(select(Visit).where(Visit.visit_id == visit_id).with_for_update())
    if visit is None:
        get_visit(db, visit_id)
    if visit.status not in ASSESSABLE_STATUSES:
        raise AppError(409, "VISIT_CLOSED", "Lượt khám đã kết thúc, không chạy trích xuất",
                       [{"current": visit.status}])
    if not (visit.free_text_description or "").strip():
        raise AppError(422, "NO_FREE_TEXT", "Lượt khám chưa có mô tả tự do để trích xuất",
                       [{"field": "free_text_description"}])

    db.execute(update(AiAssessmentLog)
               .where(AiAssessmentLog.visit_id == visit_id, AiAssessmentLog.run_type == "Extraction",
                      AiAssessmentLog.status == "Queued")
               .values(status="Skipped", error_detail="SUPERSEDED", completed_at=func.now()))
    run = AiAssessmentLog(visit_id=visit_id, run_type="Extraction", triggered_by=actor.user_id,
                          status="Queued", candidates=[])
    db.add(run)
    db.flush()
    audit.record(db, action="CREATE", entity="ai_assessment_log", entity_id=run.assessment_id,
                 actor_id=actor.user_id,
                 new_values={"visit_id": str(visit_id), "run_type": "Extraction", "status": run.status})
    return run


# ============================================================================ 2. worker lấy việc
def claim_next(db: Session) -> AiAssessmentLog | None:
    """Lấy một việc Queued, Extraction trước rồi FIFO; khóa bằng SKIP LOCKED để nhiều worker không
    tranh nhau. Bên gọi commit ngay để lease có hiệu lực với worker khác."""
    candidate = (select(AiAssessmentLog.assessment_id)
                 .where(AiAssessmentLog.status == "Queued")
                 .order_by(case((AiAssessmentLog.run_type == "Extraction", 0), else_=1),
                           AiAssessmentLog.queued_at, AiAssessmentLog.assessment_id)
                 .limit(1).with_for_update(skip_locked=True).scalar_subquery())
    lease = text(f"now() + interval '{int(settings.WORKER_LEASE_SECONDS)} seconds'")
    assessment_id = db.scalar(update(AiAssessmentLog)
                              .where(AiAssessmentLog.assessment_id == candidate)
                              .values(status="Running", started_at=func.now(), lease_until=lease,
                                      attempt_count=AiAssessmentLog.attempt_count + 1)
                              .returning(AiAssessmentLog.assessment_id))
    return db.get(AiAssessmentLog, assessment_id) if assessment_id else None


def sweep_expired(db: Session) -> dict[str, int]:
    """Thu hồi việc Running quá hạn lease (worker chết). Còn lượt thử -> Queued; hết -> Failed."""
    expired = db.scalars(select(AiAssessmentLog)
                         .where(AiAssessmentLog.status == "Running", AiAssessmentLog.lease_until < func.now())
                         .with_for_update(skip_locked=True)).all()
    requeued = failed = 0
    for run in expired:
        if run.attempt_count < settings.WORKER_MAX_ATTEMPTS:
            run.status, run.started_at, run.lease_until = "Queued", None, None
            requeued += 1
        else:
            _finish_failed(db, run, "LEASE_EXPIRED")
            failed += 1
    db.flush()
    return {"requeued": requeued, "failed": failed}


# ============================================================================ 3. ghi kết quả
def _is_latest(db: Session, run: AiAssessmentLog) -> bool:
    latest = db.scalar(select(AiAssessmentLog.assessment_id)
                       .where(AiAssessmentLog.visit_id == run.visit_id, AiAssessmentLog.run_type == "Assessment",
                              AiAssessmentLog.error_detail.is_distinct_from("SUPERSEDED"))
                       .order_by(AiAssessmentLog.queued_at.desc(), AiAssessmentLog.assessment_id.desc())
                       .limit(1))
    return latest is None or latest == run.assessment_id


def _open_visit_for(db: Session, run: AiAssessmentLog) -> Visit | None:
    """Lượt khám cần cập nhật theo lần chạy này: chỉ khi còn mở VÀ đây là lần chạy mới nhất."""
    visit = db.scalar(select(Visit).where(Visit.visit_id == run.visit_id).with_for_update())
    if visit is None or visit.status not in ASSESSABLE_STATUSES or not _is_latest(db, run):
        return None
    return visit


def write_preliminary(db: Session, assessment_id: uuid.UUID, state: dict) -> None:
    """Công bố gợi ý tất định (Node 2) trước khi LLM xong. Bên gọi commit ngay."""
    run = db.get(AiAssessmentLog, assessment_id)
    if run is None or run.status != "Running":
        return
    run.candidates = state.get("candidates") or []
    visit = _open_visit_for(db, run)
    if visit is not None:
        visit.ai_status = "Preliminary"
        visit.updated_at = func.now()
    db.flush()


def write_result(db: Session, assessment_id: uuid.UUID, final: dict, *, reader: KnowledgeReader,
                 model_name: str | None, prompt_version: str | None,
                 latency_phase1_ms: int | None, latency_llm_ms: int | None, latency_total_ms: int) -> None:
    run = db.get(AiAssessmentLog, assessment_id)
    if run is None or run.status != "Running":
        return                                           # đã bị sweeper thu hồi / thay thế
    status = final.get("ai_status")
    if status not in _VISIT_STATUS:
        _finish_failed(db, run, f"UNEXPECTED_STATUS:{status}")
        return
    hits = _enrich_hits(final.get("rule_hits") or [], reader.active_triage_rules())
    llm_output = final.get("llm_output")
    run.status, run.mode = status, final.get("mode")
    run.rule_hits, run.candidates = hits, final.get("candidates") or []
    run.priority_rule, run.priority_final = final.get("priority_rule"), final.get("priority_final")
    run.validation_result, run.error_detail = final.get("validation_result"), final.get("error")
    run.llm_output_raw = json.dumps(llm_output, ensure_ascii=False) if llm_output is not None else None
    release_id = reader.active_release().get("release_id")
    run.knowledge_release_id = uuid.UUID(release_id) if release_id else run.knowledge_release_id
    run.model_name = model_name if run.mode == "Full" else None
    run.prompt_version = prompt_version if run.mode == "Full" else None
    run.latency_phase1_ms, run.latency_llm_ms, run.latency_total_ms = latency_phase1_ms, latency_llm_ms, latency_total_ms
    run.lease_until, run.completed_at = None, func.now()

    visit = _open_visit_for(db, run)
    if visit is not None:
        _apply_triage(visit, is_red_flag=bool(final.get("is_red_flag")), hits=hits,
                      priority_rule=run.priority_rule or "Routine",
                      priority_final=run.priority_final or run.priority_rule or "Routine")
        visit.ai_status = _VISIT_STATUS[status]
    db.flush()


def _finish_failed(db: Session, run: AiAssessmentLog, code: str) -> None:
    run.status, run.error_detail = "Failed", code[:200]
    run.lease_until, run.completed_at = None, func.now()
    if run.run_type != "Assessment":
        return
    visit = _open_visit_for(db, run)
    if visit is not None:
        visit.ai_status = "Failed"
        visit.updated_at = func.now()


def write_failure(db: Session, assessment_id: uuid.UUID, code: str) -> None:
    """Lỗi hạ tầng / lập trình trong worker (không phải lỗi LLM — lỗi LLM đã thành Degraded)."""
    run = db.get(AiAssessmentLog, assessment_id)
    if run is not None and run.status == "Running":
        _finish_failed(db, run, code)
        db.flush()


def write_extraction(db: Session, assessment_id: uuid.UUID, suggestions: list[dict], *,
                     model_name: str | None, prompt_version: str, latency_total_ms: int) -> None:
    run = db.get(AiAssessmentLog, assessment_id)
    if run is None or run.status != "Running":
        return
    run.status, run.mode, run.candidates = "Completed", None, suggestions
    run.model_name, run.prompt_version = model_name, prompt_version
    run.latency_llm_ms = run.latency_total_ms = latency_total_ms
    run.lease_until, run.completed_at = None, func.now()
    audit.record(db, action="AI_ASSESSMENT", entity="visit", entity_id=run.visit_id,
                 actor_id=run.triggered_by or SYSTEM_USER_ID,
                 new_values={"assessment_id": str(run.assessment_id), "run_type": "Extraction",
                             "status": "Completed", "suggestion_count": len(suggestions)})
    db.flush()


# ============================================================================ 4. polling trích xuất
def get_latest_extraction(db: Session, visit_id: uuid.UUID, reader: KnowledgeReader) -> dict[str, Any] | None:
    get_visit(db, visit_id)
    run = db.scalar(select(AiAssessmentLog)
                    .where(AiAssessmentLog.visit_id == visit_id, AiAssessmentLog.run_type == "Extraction")
                    .order_by(AiAssessmentLog.queued_at.desc(), AiAssessmentLog.assessment_id.desc())
                    .limit(1))
    if run is None:
        return None
    names = {row["symptom_code"]: row.get("symptom_name") or row["symptom_code"]
             for row in reader.active_symptoms()}
    suggestions = [{**row, "symptom_name": names.get(row["symptom_code"], row["symptom_code"])}
                   for row in (run.candidates or [])] if run.status == "Completed" else []
    return {"extraction_id": run.assessment_id, "status": run.status, "suggestions": suggestions,
            "completed_at": run.completed_at}
