"""Nối chẩn đoán của bác sĩ với lần chạy AI mà bác sĩ đã xem (FR02, ERD v1.8 điểm 9).

Nguồn gốc là ``diagnosis.matches_top_suggestion``; ``ai_assessment_log.physician_decision`` là bản
ghi kèm, luôn được ghi trong CÙNG transaction với thay đổi chẩn đoán chính. View
``v_ai_decision_reconciliation`` phải luôn rỗng:

    matches_top_suggestion  TRUE  -> AcceptedTop
                            FALSE -> ChoseOther
                            NULL  -> NoSuggestion

Quy tắc (phương án duyệt 18/10):
- Client gửi kèm ``assessment_id`` của kết quả đang hiển thị (không bắt buộc). Lần chạy phải thuộc
  đúng lượt khám và là ``Assessment`` (khóa ngoại kép ``fk_diagnosis_assessment`` cũng ép điều này).
- Không gửi: lấy lần chạy ``Assessment`` mới nhất mà bác sĩ đã có thể nhìn thấy kết quả.
- So sánh tại thời điểm xác nhận với gợi ý đứng đầu ``candidates[0].condition_code``. Thứ hạng thay
  đổi sau đó (LLM xong muộn) không làm đổi quyết định đã ghi.
"""
import uuid

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.exceptions import AppError
from app.models import AiAssessmentLog, Diagnosis, User

# Lần chạy đã có kết quả để bác sĩ nhìn thấy: có gợi ý (kể cả gợi ý sơ bộ khi còn Running),
# hoặc đã kết thúc theo cách không có gợi ý (cờ đỏ dừng ở Node 1 = Skipped).
_VISIBLE_STATUSES = ("Completed", "Degraded", "Skipped")

DECISION_BY_MATCH = {True: "AcceptedTop", False: "ChoseOther", None: "NoSuggestion"}


def resolve_assessment(db: Session, visit_id: uuid.UUID,
                       assessment_id: uuid.UUID | None) -> AiAssessmentLog | None:
    """Lần chạy AI gắn với chẩn đoán sắp lưu, hoặc None nếu lượt khám chưa có lần chạy nào."""
    if assessment_id is not None:
        run = db.get(AiAssessmentLog, assessment_id)
        if run is None or run.visit_id != visit_id or run.run_type != "Assessment":
            raise AppError(422, "ASSESSMENT_NOT_FOR_VISIT",
                           "Kết quả AI không thuộc lượt khám này",
                           [{"field": "assessment_id", "in": "body",
                             "message": "Không tồn tại, thuộc lượt khám khác, hoặc không phải lần đánh giá"}])
        return run
    return db.scalar(
        select(AiAssessmentLog)
        .where(AiAssessmentLog.visit_id == visit_id, AiAssessmentLog.run_type == "Assessment",
               or_(AiAssessmentLog.candidates.is_not(None), AiAssessmentLog.status.in_(_VISIBLE_STATUSES)))
        .order_by(AiAssessmentLog.queued_at.desc(), AiAssessmentLog.assessment_id.desc())
        .limit(1))


def top_suggestion(run: AiAssessmentLog | None) -> str | None:
    """Mã bệnh đứng đầu danh sách gợi ý đang hiển thị; None khi không có gợi ý nào."""
    if run is None or not isinstance(run.candidates, list) or not run.candidates:
        return None
    first = run.candidates[0]
    code = first.get("condition_code") if isinstance(first, dict) else None
    return code if isinstance(code, str) and code else None


def match_top(run: AiAssessmentLog | None, condition_code: str | None) -> bool | None:
    """TRUE khi chọn đúng gợi ý đầu; FALSE khi chọn mã khác hoặc gõ tự do lúc có gợi ý;
    None khi không có gợi ý."""
    top = top_suggestion(run)
    if top is None:
        return None
    return condition_code == top


def sync_decision(db: Session, visit_id: uuid.UUID, actor: User) -> None:
    """Ghi lại ``physician_decision`` cho mọi lần chạy AI mà chẩn đoán của lượt khám trỏ tới.

    Gọi sau MỌI thay đổi chẩn đoán chính (thêm, đổi chính, rút lại), trước commit:
    - lần chạy của chẩn đoán chính đã xác nhận: ghi quyết định theo matches_top_suggestion;
    - các lần chạy còn lại (của chẩn đoán phụ / đã rút lại): xóa quyết định cũ.
    """
    db.flush()
    rows = db.execute(select(Diagnosis.assessment_id, Diagnosis.is_primary, Diagnosis.confirmed_by_physician,
                             Diagnosis.matches_top_suggestion)
                      .where(Diagnosis.visit_id == visit_id, Diagnosis.assessment_id.is_not(None))).all()
    if not rows:
        return
    decided: dict[uuid.UUID, str] = {}
    for assessment_id, is_primary, confirmed, matches in rows:
        if is_primary and confirmed:
            decided[assessment_id] = DECISION_BY_MATCH[matches]
    referenced = {r.assessment_id for r in rows}

    for assessment_id, decision in decided.items():
        db.execute(update(AiAssessmentLog)
                   .where(AiAssessmentLog.assessment_id == assessment_id,
                          AiAssessmentLog.physician_decision.is_distinct_from(decision))
                   .values(physician_decision=decision, decided_by=actor.user_id, decided_at=func.now()))
    stale = referenced - set(decided)
    if stale:
        db.execute(update(AiAssessmentLog)
                   .where(AiAssessmentLog.assessment_id.in_(stale),
                          AiAssessmentLog.physician_decision.is_not(None))
                   .values(physician_decision=None, decided_by=None, decided_at=None))
