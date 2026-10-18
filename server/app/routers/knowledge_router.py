"""API quản trị tri thức (US11): /api/v1/admin/knowledge/...

Vai trò: chỉ Admin soạn nháp, gửi duyệt, tắt khẩn cấp, thêm nguồn; chỉ Physician (khác người soạn) duyệt /
từ chối; cả hai được xem. Nội dung tri thức không phải dữ liệu bệnh nhân nên nhật ký ghi được mã mục.
"""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.auth import require_roles
from app.core.database import get_db
from app.models import User
from app.schemas.common import Page
from app.schemas.knowledge import (ConditionDraft, DeactivatePreview, DeactivateRequest, Dependent, ExcerptDraft,
                                   ItemOut, ItemStatus, Kind, RelationDraft, ReleaseCreate, ReleaseDetail,
                                   ReleaseOut, ReviewNote, RuleDraft, SourceCreate, SourceOut, SymptomDraft)
from app.services import knowledge_service as ks

router = APIRouter(prefix="/admin/knowledge", tags=["knowledge"])

_admin = require_roles("Admin", audit_entity="knowledge_release")
_physician = require_roles("Physician", audit_entity="knowledge_release")
_viewer = require_roles("Admin", "Physician", audit_entity="knowledge_release")


def _detail(db: Session, rel) -> dict:
    return {**ReleaseOut.model_validate(rel).model_dump(), "changes": ks.release_changes(db, rel)}


# ============================================================================ bản phát hành
@router.get("/releases", response_model=list[ReleaseOut])
def list_releases(_: User = Depends(_viewer), db: Session = Depends(get_db)):
    return ks.list_releases(db)


@router.post("/releases", response_model=ReleaseOut, status_code=201)
def create_release(body: ReleaseCreate, actor: User = Depends(_admin), db: Session = Depends(get_db)):
    """Mở bản phát hành mới để soạn (mỗi lúc tối đa một bản đang mở)."""
    rel = ks.create_release(db, body, actor)
    db.commit()
    return rel


@router.get("/releases/{release_id}", response_model=ReleaseDetail)
def get_release(release_id: uuid.UUID, _: User = Depends(_viewer), db: Session = Depends(get_db)):
    """Kèm danh sách thay đổi; khi bản còn mở, mỗi thay đổi có ``active_values`` để so với bản đang dùng."""
    return _detail(db, ks.get_release(db, release_id))


@router.post("/releases/{release_id}/submit", response_model=ReleaseDetail)
def submit_release(release_id: uuid.UUID, actor: User = Depends(_admin), db: Session = Depends(get_db)):
    rel = ks.submit_release(db, release_id, actor)
    db.commit()
    return _detail(db, rel)


@router.post("/releases/{release_id}/approve", response_model=ReleaseDetail)
def approve_release(release_id: uuid.UUID, actor: User = Depends(_physician), db: Session = Depends(get_db)):
    """Kích hoạt toàn bộ bản phát hành trong một transaction. Tập Active không khép kín -> 409."""
    rel = ks.approve_release(db, release_id, actor)
    ks.commit_knowledge(db)
    return _detail(db, rel)


@router.post("/releases/{release_id}/reject", response_model=ReleaseDetail)
def reject_release(release_id: uuid.UUID, body: ReviewNote, actor: User = Depends(_physician),
                   db: Session = Depends(get_db)):
    rel = ks.reject_release(db, release_id, body.note, actor)
    db.commit()
    return _detail(db, rel)


# ============================================================================ nguồn
@router.get("/sources", response_model=list[SourceOut])
def list_sources(_: User = Depends(_viewer), db: Session = Depends(get_db)):
    return ks.list_sources(db)


@router.post("/sources", response_model=SourceOut, status_code=201)
def create_source(body: SourceCreate, actor: User = Depends(_admin), db: Session = Depends(get_db)):
    src = ks.create_source(db, body, actor)
    db.commit()
    return src


# ============================================================================ soạn nháp từng loại
def _put(kind: str, key: str, body, actor: User, db: Session) -> dict:
    out = ks.put_draft(db, kind, key, body, actor)
    db.commit()
    return out


@router.put("/symptoms/{symptom_code}", response_model=ItemOut)
def put_symptom(symptom_code: str, body: SymptomDraft, actor: User = Depends(_admin), db: Session = Depends(get_db)):
    return _put("symptoms", symptom_code, body, actor, db)


@router.put("/conditions/{condition_code}", response_model=ItemOut)
def put_condition(condition_code: str, body: ConditionDraft, actor: User = Depends(_admin),
                  db: Session = Depends(get_db)):
    return _put("conditions", condition_code, body, actor, db)


@router.put("/relations/{condition_code}/{symptom_code}", response_model=ItemOut)
def put_relation(condition_code: str, symptom_code: str, body: RelationDraft, actor: User = Depends(_admin),
                 db: Session = Depends(get_db)):
    return _put("relations", f"{condition_code}/{symptom_code}", body, actor, db)


@router.put("/excerpts/{excerpt_key}", response_model=ItemOut)
def put_excerpt(excerpt_key: str, body: ExcerptDraft, actor: User = Depends(_admin), db: Session = Depends(get_db)):
    return _put("excerpts", excerpt_key, body, actor, db)


@router.put("/rules/{rule_key}", response_model=ItemOut)
def put_rule(rule_key: str, body: RuleDraft, actor: User = Depends(_admin), db: Session = Depends(get_db)):
    return _put("rules", rule_key, body, actor, db)


# ============================================================================ đọc, bỏ nháp, tắt khẩn cấp (mọi loại)
@router.get("/{kind}", response_model=Page[ItemOut])
def list_items(kind: Kind, status: ItemStatus | None = Query(None), q: str | None = Query(None, max_length=80),
               limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
               _: User = Depends(_viewer), db: Session = Depends(get_db)):
    total, items = ks.list_items(db, kind, status=status, q=q, limit=limit, offset=offset)
    return Page[ItemOut](total=total, limit=limit, offset=offset, items=items)


@router.get("/{kind}/{key:path}/versions", response_model=list[ItemOut])
def item_history(kind: Kind, key: str, _: User = Depends(_viewer), db: Session = Depends(get_db)):
    """Mọi phiên bản của một mục, mới nhất trước. Quan hệ dùng key ``<condition_code>/<symptom_code>``."""
    return ks.item_history(db, kind, key)


@router.delete("/{kind}/{key:path}/draft", status_code=204)
def drop_draft(kind: Kind, key: str, actor: User = Depends(_admin), db: Session = Depends(get_db)):
    """Bỏ mục khỏi bản nháp đang soạn."""
    ks.drop_draft(db, kind, key, actor)
    db.commit()


@router.get("/{kind}/{key:path}/dependents", response_model=DeactivatePreview)
def preview_deactivate(kind: Kind, key: str, _: User = Depends(_admin), db: Session = Depends(get_db)):
    """Xem trước các mục Active sẽ bị tắt theo (cho hộp thoại xác nhận)."""
    return {"kind": kind, "key": key, "dependents": ks.dependents(db, kind, key)}


@router.post("/{kind}/{key:path}/deactivate", response_model=list[Dependent])
def deactivate(kind: Kind, key: str, body: DeactivateRequest, actor: User = Depends(_admin),
               db: Session = Depends(get_db)):
    """Tắt khẩn cấp (không cần duyệt) kèm tắt dây chuyền. Trả danh sách mục đã bị tắt theo."""
    deps = ks.deactivate(db, kind, key, body, actor)
    ks.commit_knowledge(db)
    return deps
