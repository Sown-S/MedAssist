"""API khởi tạo và polling kết quả đánh giá AI của lượt khám."""

import uuid
from importlib import import_module

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.ai.interfaces import KnowledgeReader
from app.core.audit_view import CLINICAL_ROLES, audit_view
from app.core.auth import require_roles
from app.core.database import get_db
from app.exceptions import AppError, NotFoundError
from app.models import User
from app.schemas.assessment import AssessmentOut
from app.services import assessment_service

router = APIRouter(tags=["assessment"])

_nurse_visit = require_roles("Nurse", audit_entity="visit")
_view_assessment = audit_view(
    "visit", roles=CLINICAL_ROLES, id_param="visit_id", dedupe_seconds=300
)


def _knowledge_unavailable() -> AppError:
    return AppError(
        503,
        "KNOWLEDGE_UNAVAILABLE",
        "Chưa nạp bộ tri thức đang hoạt động",
    )


def get_knowledge_reader(db: Session = Depends(get_db)) -> KnowledgeReader:
    """Tạo reader DB khi module tích hợp đã có; test có thể override dependency này."""
    try:
        module = import_module("app.services.knowledge_reader")
    except ModuleNotFoundError as exc:
        if exc.name != "app.services.knowledge_reader":
            raise
        raise _knowledge_unavailable() from None

    factory = getattr(module, "get_knowledge_reader", None)
    if callable(factory):
        return factory(db)
    reader_type = getattr(module, "KnowledgeReader", None)
    if callable(reader_type):
        return reader_type(db)
    raise _knowledge_unavailable()


def _latest_or_404(
    db: Session, visit_id: uuid.UUID, knowledge_reader: KnowledgeReader
) -> dict:
    result = assessment_service.get_latest_assessment(db, visit_id, knowledge_reader)
    if result is None:
        raise NotFoundError("Chưa có kết quả đánh giá AI cho lượt khám này")
    return result


@router.post(
    "/visits/{visit_id}/assessment",
    response_model=AssessmentOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def trigger_assessment(
    visit_id: uuid.UUID,
    actor: User = Depends(_nurse_visit),
    db: Session = Depends(get_db),
    knowledge_reader: KnowledgeReader = Depends(get_knowledge_reader),
):
    """Chạy pha luật đồng bộ rồi xếp hàng; không chạy Node 2-4 hoặc LLM trong API."""
    assessment_service.trigger_assessment(
        db,
        visit_id,
        knowledge_reader,
        triggered_by=actor.user_id,
    )
    db.commit()
    return _latest_or_404(db, visit_id, knowledge_reader)


@router.get("/visits/{visit_id}/assessment", response_model=AssessmentOut)
def get_assessment(
    visit_id: uuid.UUID,
    _: User = Depends(_view_assessment),
    db: Session = Depends(get_db),
    knowledge_reader: KnowledgeReader = Depends(get_knowledge_reader),
):
    """Trả lượt Assessment mới nhất để client polling."""
    return _latest_or_404(db, visit_id, knowledge_reader)
