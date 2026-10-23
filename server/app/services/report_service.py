"""Báo cáo cho Admin (US09). Admin không xem dữ liệu bệnh nhân: chỉ trả số đếm, tiền và metadata
của lần chạy AI; không trả visit_id, input_features, llm_output_raw."""
import datetime
from typing import Any

from sqlalchemy import Date, Select, cast, func, select
from sqlalchemy.orm import Session

from app.exceptions import AppError
from app.models import AiAssessmentLog, Invoice, KnowledgeRelease, Visit

MAX_RANGE_DAYS = 366
VISIT_STATUSES = ("Waiting", "CheckedIn", "Examining", "Prescribed", "Finished", "Cancelled")


def date_range(db: Session, date_from: datetime.date | None,
               date_to: datetime.date | None) -> tuple[datetime.date, datetime.date]:
    """Mặc định hôm nay theo giờ CSDL (cùng mốc với visit.queue_date)."""
    today = db.scalar(select(func.current_date()))
    date_to = date_to or today
    date_from = date_from or date_to
    if date_from > date_to:
        raise AppError(422, "INVALID_DATE_RANGE", "date_from phải trước hoặc bằng date_to")
    if (date_to - date_from).days >= MAX_RANGE_DAYS:
        raise AppError(422, "INVALID_DATE_RANGE", f"Khoảng thời gian tối đa {MAX_RANGE_DAYS} ngày")
    return date_from, date_to


def _visits(db: Session, d1: datetime.date, d2: datetime.date) -> dict:
    in_range = Visit.queue_date.between(d1, d2)
    by_status = dict.fromkeys(VISIT_STATUSES, 0)
    by_status.update(db.execute(select(Visit.status, func.count()).where(in_range).group_by(Visit.status)).all())
    red = db.scalar(select(func.count()).select_from(Visit).where(in_range, Visit.is_red_flag))
    return {"total": sum(by_status.values()), "by_status": by_status, "red_flags": red or 0}


def _revenue(db: Session, d1: datetime.date, d2: datetime.date) -> dict:
    # Doanh thu tính theo ngày thu tiền (paid_at), không theo ngày khám.
    paid_day = cast(Invoice.paid_at, Date)
    cond = (Invoice.payment_status == "Paid", paid_day.between(d1, d2))
    n, total, cons, para, drug = db.execute(select(
        func.count(), func.coalesce(func.sum(Invoice.total_amount), 0),
        func.coalesce(func.sum(Invoice.consultation_fee), 0), func.coalesce(func.sum(Invoice.paraclinical_fee), 0),
        func.coalesce(func.sum(Invoice.drug_fee), 0)).where(*cond)).one()
    days = db.execute(select(paid_day, func.sum(Invoice.total_amount)).where(*cond)
                      .group_by(paid_day).order_by(paid_day)).all()
    return {"invoices_paid": n, "total": total, "consultation": cons, "paraclinical": para, "drug": drug,
            "by_day": [{"date": d, "total": t} for d, t in days]}


def _ai(db: Session, d1: datetime.date, d2: datetime.date) -> dict:
    in_range = cast(AiAssessmentLog.queued_at, Date).between(d1, d2)
    counts: dict[tuple[str, str], int] = {
        (rt, st): n for rt, st, n in db.execute(
            select(AiAssessmentLog.run_type, AiAssessmentLog.status, func.count())
            .where(in_range).group_by(AiAssessmentLog.run_type, AiAssessmentLog.status)).all()}

    def c(run_type: str, *statuses: str) -> int:
        return sum(n for (rt, st), n in counts.items() if rt == run_type and (not statuses or st in statuses))

    latency = db.scalar(select(func.avg(AiAssessmentLog.latency_total_ms)).where(
        in_range, AiAssessmentLog.run_type == "Assessment", AiAssessmentLog.status.in_(("Completed", "Degraded"))))
    decisions = dict(db.execute(
        select(AiAssessmentLog.physician_decision, func.count())
        .where(in_range, AiAssessmentLog.run_type == "Assessment", AiAssessmentLog.physician_decision.is_not(None))
        .group_by(AiAssessmentLog.physician_decision)).all())
    accepted, other = decisions.get("AcceptedTop", 0), decisions.get("ChoseOther", 0)
    return {
        "assessments": {"total": c("Assessment"), "full": c("Assessment", "Completed"),
                        "rule_only": c("Assessment", "Degraded"), "failed": c("Assessment", "Failed"),
                        "skipped": c("Assessment", "Skipped"), "pending": c("Assessment", "Queued", "Running"),
                        "avg_latency_ms": None if latency is None else round(latency)},
        # Tỉ lệ chấp nhận chỉ tính ca có gợi ý: NoSuggestion không vào mẫu số.
        "decisions": {"accepted_top": accepted, "chose_other": other,
                      "no_suggestion": decisions.get("NoSuggestion", 0),
                      "acceptance_rate": round(accepted / (accepted + other), 4) if accepted + other else None},
        "extractions": {"total": c("Extraction"), "completed": c("Extraction", "Completed"),
                        "failed": c("Extraction", "Failed")},
    }


def summary(db: Session, date_from: datetime.date | None, date_to: datetime.date | None) -> dict:
    d1, d2 = date_range(db, date_from, date_to)
    return {"date_from": d1, "date_to": d2, "visits": _visits(db, d1, d2), "revenue": _revenue(db, d1, d2),
            "ai": _ai(db, d1, d2)}


def _suggested_codes(candidates: Any) -> list[str]:
    if not isinstance(candidates, list):
        return []
    return [str(c.get("condition_code") or c.get("symptom_code")) for c in candidates
            if isinstance(c, dict) and (c.get("condition_code") or c.get("symptom_code"))]


def _ai_log_query(d1: datetime.date, d2: datetime.date, run_type: str | None, status: str | None,
                  mode: str | None) -> Select:
    stmt = (select(AiAssessmentLog, KnowledgeRelease.label)
            .outerjoin(KnowledgeRelease, KnowledgeRelease.release_id == AiAssessmentLog.knowledge_release_id)
            .where(cast(AiAssessmentLog.queued_at, Date).between(d1, d2)))
    if run_type:
        stmt = stmt.where(AiAssessmentLog.run_type == run_type)
    if status:
        stmt = stmt.where(AiAssessmentLog.status == status)
    if mode:
        stmt = stmt.where(AiAssessmentLog.mode == mode)
    return stmt


def ai_logs(db: Session, date_from: datetime.date | None, date_to: datetime.date | None, *, run_type: str | None,
            status: str | None, mode: str | None, limit: int, offset: int) -> dict:
    d1, d2 = date_range(db, date_from, date_to)
    stmt = _ai_log_query(d1, d2, run_type, status, mode)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = db.execute(stmt.order_by(AiAssessmentLog.queued_at.desc(), AiAssessmentLog.assessment_id.desc())
                      .limit(limit).offset(offset)).all()
    items = [{
        "assessment_id": r.assessment_id, "run_type": r.run_type, "status": r.status, "mode": r.mode,
        "priority_rule": r.priority_rule, "priority_final": r.priority_final,
        "suggested_codes": _suggested_codes(r.candidates), "model_name": r.model_name,
        "prompt_version": r.prompt_version, "knowledge_release_label": label,
        "latency_phase1_ms": r.latency_phase1_ms, "latency_llm_ms": r.latency_llm_ms,
        "latency_total_ms": r.latency_total_ms, "attempt_count": r.attempt_count, "error_detail": r.error_detail,
        "physician_decision": r.physician_decision, "queued_at": r.queued_at, "started_at": r.started_at,
        "completed_at": r.completed_at} for r, label in rows]
    return {"total": total or 0, "limit": limit, "offset": offset, "items": items}
