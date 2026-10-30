"""API khởi tạo và polling kết quả đánh giá AI và trích xuất triệu chứng của lượt khám."""

import uuid
from importlib import import_module
from threading import Lock

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.ai.interfaces import KnowledgeReader
from app.ai.snapshot_reader import SnapshotReader
from app.core.audit_view import CLINICAL_ROLES, audit_view
from app.core.auth import require_roles
from app.core.database import get_db
from app.exceptions import AppError, NotFoundError
from app.models import User
from app.schemas.assessment import AssessmentOut, ExtractionOut
from app.services import ai_queue_service, assessment_service

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


_reader_cache: dict[tuple[object, object], KnowledgeReader] = {}
_reader_cache_lock = Lock()


def get_knowledge_reader(db: Session = Depends(get_db)) -> KnowledgeReader:
    """Cache reader theo engine, cố định snapshot riêng cho từng request."""
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
    db_reader_type = getattr(module, "DbKnowledgeReader", None)
    if callable(db_reader_type):
        bind = db.get_bind() if hasattr(db, "get_bind") else None
        key = (db_reader_type, bind)
        with _reader_cache_lock:
            reader = _reader_cache.get(key)
            if reader is None:
                reader = db_reader_type(bind) if bind is not None else db_reader_type()
                _reader_cache[key] = reader
        # refresh trả một snapshot nhất quán. Không đọc lại các active_* trên
        # reader chung vì request khác có thể vừa refresh sang epoch mới.
        return SnapshotReader(reader.refresh())
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
    ai_queue_service.enqueue_assessment(db, visit_id, actor, knowledge_reader)
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


def _latest_extraction_or_404(db: Session, visit_id: uuid.UUID, knowledge_reader: KnowledgeReader) -> dict:
    result = ai_queue_service.get_latest_extraction(db, visit_id, knowledge_reader)
    if result is None:
        raise NotFoundError("Chưa có lần trích xuất triệu chứng cho lượt khám này")
    return result


@router.post(
    "/visits/{visit_id}/symptom-extraction",
    response_model=ExtractionOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def trigger_extraction(
    visit_id: uuid.UUID,
    actor: User = Depends(_nurse_visit),
    db: Session = Depends(get_db),
    knowledge_reader: KnowledgeReader = Depends(get_knowledge_reader),
):
    """Xếp hàng trích xuất từ mô tả tự do; gợi ý chỉ là đề xuất, y tá xác nhận qua PUT /symptoms."""
    ai_queue_service.enqueue_extraction(db, visit_id, actor)
    db.commit()
    return _latest_extraction_or_404(db, visit_id, knowledge_reader)


@router.get("/visits/{visit_id}/symptom-extraction", response_model=ExtractionOut)
def get_extraction(
    visit_id: uuid.UUID,
    _: User = Depends(_view_assessment),
    db: Session = Depends(get_db),
    knowledge_reader: KnowledgeReader = Depends(get_knowledge_reader),
):
    return _latest_extraction_or_404(db, visit_id, knowledge_reader)
