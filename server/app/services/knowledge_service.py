"""Quản trị tri thức (US11, FR11; ERD v1.8 mục 2.3, 9): bản phát hành Draft → PendingApproval → Active.

- Chỉ Admin soạn; chỉ Physician (khác người soạn) duyệt / từ chối. Mỗi lúc tối đa MỘT bản đang mở
  (uq_release_single_open).
- Soạn từng mục trong bản nháp đang mở: lần sửa đầu tạo dòng phiên bản mới (version + 1, status Draft);
  sửa tiếp thì cập nhật chính dòng nháp đó. Phiên bản cũ luôn được giữ.
- Duyệt = MỘT transaction (``activate_release``, dùng chung với scripts/import_okf.py): bản Active cũ của
  từng mã -> Retired(Superseded), bản mới -> Active; epoch tự tăng (trigger 7); trigger toàn vẹn kiểm tập
  Active khép kín lúc COMMIT (``commit_knowledge`` đổi lỗi đó thành 409 dễ đọc).
- Tắt khẩn cấp (Admin, không cần duyệt): mục Active -> Retired(Deactivated) kèm TẮT DÂY CHUYỀN các mục phụ
  thuộc trong cùng transaction; client phải gửi lại đúng danh sách phụ thuộc vừa xem trước. Bật lại = soạn
  phiên bản mới trong một bản phát hành và chờ duyệt.
"""
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import String, cast, func, or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.exceptions import AppError, NotFoundError
from app.models import (Condition, ConditionSymptom, GuidelineExcerpt, KnowledgeRelease, KnowledgeSource, Symptom,
                        TriageRule, User)
from app.schemas.knowledge import DRAFT_SCHEMAS, DeactivateRequest, ReleaseCreate, SourceCreate
from app.services import audit_service as audit
from app.validation.knowledge_validators import (CONDITION_CODE_MAX, SLUG_KEY_MAX, SLUG_RE, SYMPTOM_CODE_MAX,
                                                 check_rule_key, logic_symptom_codes)

# kind -> (model, cột khóa, cột nội dung, tên bảng cho nhật ký)
KINDS: dict[str, tuple[Any, tuple[str, ...], tuple[str, ...], str]] = {
    "symptoms": (Symptom, ("symptom_code",), ("symptom_name", "category"), "symptom"),
    "conditions": (Condition, ("condition_code",), ("name_vi", "icd10_code", "disease_group", "description"),
                   "condition"),
    "relations": (ConditionSymptom, ("condition_code", "symptom_code"), ("polarity", "weight", "is_key", "source_id"),
                  "condition_symptom"),
    "excerpts": (GuidelineExcerpt, ("excerpt_key",),
                 ("condition_code", "title", "content", "source_id", "source_locator"), "guideline_excerpt"),
    "rules": (TriageRule, ("rule_key",),
              ("rule_name", "rule_type", "resulting_priority", "reason_text", "condition_logic", "source_id"),
              "triage_rule"),
}
ORDER = ("symptoms", "conditions", "relations", "excerpts", "rules")       # khóa trước, quan hệ sau
OPEN_STATUSES = ("Draft", "PendingApproval")


# ============================================================================ tiện ích
def _model(kind: str):
    if kind not in KINDS:
        raise NotFoundError("Loại tri thức không hợp lệ")
    return KINDS[kind]


def key_of(kind: str, row) -> str:
    return "/".join(str(getattr(row, c)) for c in KINDS[kind][1])


def _where_key(kind: str, key: str) -> list:
    model, keycols, _, _ = KINDS[kind]
    parts = key.split("/")
    if len(parts) != len(keycols):
        raise NotFoundError("Mã không hợp lệ")
    return [getattr(model, c) == p for c, p in zip(keycols, parts)]


def _plain(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def values_of(kind: str, row) -> dict[str, Any]:
    _, keycols, cols, _ = KINDS[kind]
    return {c: _plain(getattr(row, c)) for c in (*keycols, *cols)}


def item_out(kind: str, row, label: str | None = None) -> dict[str, Any]:
    return {"kind": kind, "key": key_of(kind, row), "version": row.version, "status": row.status,
            "release_id": row.release_id, "release_label": label, "created_at": row.created_at,
            "retired_at": row.retired_at, "retired_reason": row.retired_reason, "values": values_of(kind, row)}


def commit_knowledge(db: Session) -> None:
    """COMMIT; nếu trigger toàn vẹn từ chối (tập Active không khép kín) -> 409 kèm danh sách từ CSDL."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        msg = str(getattr(exc.orig, "diag", None) and exc.orig.diag.message_primary or exc.orig)
        if "khép kín" in msg:
            raise AppError(409, "KNOWLEDGE_INTEGRITY",
                           "Tập tri thức Active sẽ không khép kín: còn mục đang dùng mã bị tắt hoặc chưa được duyệt",
                           [{"message": msg}]) from None
        raise


# ============================================================================ bản phát hành
def open_release(db: Session, *, lock: bool = False) -> KnowledgeRelease | None:
    stmt = select(KnowledgeRelease).where(KnowledgeRelease.status.in_(OPEN_STATUSES))
    return db.scalar(stmt.with_for_update() if lock else stmt)


def get_release(db: Session, release_id: uuid.UUID, *, lock: bool = False) -> KnowledgeRelease:
    stmt = select(KnowledgeRelease).where(KnowledgeRelease.release_id == release_id)
    rel = db.scalar(stmt.with_for_update() if lock else stmt)
    if rel is None:
        raise NotFoundError("Không tìm thấy bản phát hành")
    return rel


def list_releases(db: Session) -> list[KnowledgeRelease]:
    return list(db.scalars(select(KnowledgeRelease).order_by(KnowledgeRelease.created_at.desc())))


def create_release(db: Session, data: ReleaseCreate, actor: User) -> KnowledgeRelease:
    current = open_release(db)
    if current is not None:
        raise AppError(409, "RELEASE_ALREADY_OPEN", "Đang có bản phát hành mở; duyệt hoặc từ chối trước",
                       [{"release_id": str(current.release_id), "label": current.label, "status": current.status}])
    if db.scalar(select(KnowledgeRelease.release_id).where(KnowledgeRelease.label == data.label)):
        raise AppError(409, "DUPLICATE_LABEL", "Nhãn phiên bản đã dùng",
                       [{"field": "label", "in": "body"}])
    rel = KnowledgeRelease(label=data.label, description=data.description, status="Draft", created_by=actor.user_id)
    db.add(rel)
    db.flush()
    audit.record(db, action="CREATE", entity="knowledge_release", entity_id=rel.release_id, actor_id=actor.user_id,
                 new_values={"label": rel.label})
    return rel


def release_changes(db: Session, rel: KnowledgeRelease) -> list[dict[str, Any]]:
    out = []
    for kind in ORDER:
        model = KINDS[kind][0]
        for row in db.scalars(select(model).where(model.release_id == rel.release_id,
                                                  or_(model.status != "Retired",
                                                      model.retired_reason == "Superseded"))
                              .order_by(*[getattr(model, c) for c in KINDS[kind][1]])):
            active = None
            if rel.status in OPEN_STATUSES:
                act = db.scalar(select(model).where(*_where_key(kind, key_of(kind, row)), model.status == "Active"))
                active = values_of(kind, act) if act is not None else None
            out.append({"kind": kind, "key": key_of(kind, row), "version": row.version, "status": row.status,
                        "action": "new" if row.version == 1 else "changed",
                        "values": values_of(kind, row), "active_values": active})
    return out


def _release_rows(db: Session, rel: KnowledgeRelease, kind: str, statuses=OPEN_STATUSES):
    model = KINDS[kind][0]
    return list(db.scalars(select(model).where(model.release_id == rel.release_id, model.status.in_(statuses))))


def submit_release(db: Session, release_id: uuid.UUID, actor: User) -> KnowledgeRelease:
    rel = get_release(db, release_id, lock=True)
    if rel.status != "Draft":
        raise AppError(409, "RELEASE_NOT_DRAFT", "Chỉ gửi duyệt được bản đang soạn (Draft)", [{"current": rel.status}])
    total = 0
    for kind in ORDER:
        model = KINDS[kind][0]
        total += db.execute(update(model).where(model.release_id == rel.release_id, model.status == "Draft")
                            .values(status="PendingApproval")).rowcount
    if total == 0:
        raise AppError(409, "RELEASE_EMPTY", "Bản phát hành chưa có thay đổi nào")
    rel.status, rel.submitted_at, rel.review_note = "PendingApproval", func.now(), None
    db.flush()
    audit.record(db, action="UPDATE", entity="knowledge_release", entity_id=rel.release_id, actor_id=actor.user_id,
                 new_values={"status": "PendingApproval", "items": total})
    return rel


def activate_release(db: Session, rel: KnowledgeRelease, approver: User) -> dict[str, int]:
    """Kích hoạt mọi mục Draft/PendingApproval của bản phát hành trong transaction hiện tại (chưa commit)."""
    if approver.user_id == rel.created_by:
        raise AppError(409, "APPROVER_IS_AUTHOR", "Người duyệt phải khác người soạn")
    counts = {}
    now = func.now()
    for kind in ORDER:
        model = KINDS[kind][0]
        rows = _release_rows(db, rel, kind)
        for row in rows:                               # bản Active cũ rời trước (uq_*_active)
            db.execute(update(model).where(*_where_key(kind, key_of(kind, row)), model.status == "Active")
                       .values(status="Retired", retired_by=approver.user_id, retired_at=now,
                               retired_reason="Superseded"))
        for row in rows:
            row.status = "Active"
        counts[kind] = len(rows)
        db.flush()
    rel.status, rel.approved_by, rel.approved_at = "Active", approver.user_id, now
    rel.submitted_at = rel.submitted_at or now
    db.flush()
    return counts


def approve_release(db: Session, release_id: uuid.UUID, actor: User) -> KnowledgeRelease:
    rel = get_release(db, release_id, lock=True)
    if rel.status != "PendingApproval":
        raise AppError(409, "RELEASE_NOT_PENDING", "Chỉ duyệt được bản đang chờ duyệt", [{"current": rel.status}])
    counts = activate_release(db, rel, actor)
    audit.record(db, action="APPROVE", entity="knowledge_release", entity_id=rel.release_id, actor_id=actor.user_id,
                 new_values={"label": rel.label, "activated": counts})
    return rel


def reject_release(db: Session, release_id: uuid.UUID, note: str, actor: User) -> KnowledgeRelease:
    rel = get_release(db, release_id, lock=True)
    if rel.status != "PendingApproval":
        raise AppError(409, "RELEASE_NOT_PENDING", "Chỉ từ chối được bản đang chờ duyệt", [{"current": rel.status}])
    if actor.user_id == rel.created_by:
        raise AppError(409, "APPROVER_IS_AUTHOR", "Người duyệt phải khác người soạn")
    for kind in ORDER:
        model = KINDS[kind][0]
        db.execute(update(model).where(model.release_id == rel.release_id, model.status == "PendingApproval")
                   .values(status="Draft"))
    rel.status, rel.review_note = "Draft", note
    db.flush()
    audit.record(db, action="REJECT", entity="knowledge_release", entity_id=rel.release_id, actor_id=actor.user_id,
                 new_values={"label": rel.label})
    return rel


# ============================================================================ đọc mục
def list_items(db: Session, kind: str, *, status: str | None, q: str | None, limit: int, offset: int):
    model, keycols, _, _ = _model(kind)
    stmt = select(model, KnowledgeRelease.label).join(KnowledgeRelease,
                                                      KnowledgeRelease.release_id == model.release_id)
    if status:
        stmt = stmt.where(model.status == status)
    if q:
        stmt = stmt.where(or_(*[cast(getattr(model, c), String).ilike(f"%{q}%") for c in keycols]))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(stmt.order_by(*[getattr(model, c) for c in keycols], model.version.desc())
                      .limit(limit).offset(offset)).all()
    return total, [item_out(kind, row, label) for row, label in rows]


def item_history(db: Session, kind: str, key: str) -> list[dict[str, Any]]:
    model = _model(kind)[0]
    rows = db.execute(select(model, KnowledgeRelease.label)
                      .join(KnowledgeRelease, KnowledgeRelease.release_id == model.release_id)
                      .where(*_where_key(kind, key)).order_by(model.version.desc())).all()
    if not rows:
        raise NotFoundError("Không tìm thấy mục tri thức")
    return [item_out(kind, row, label) for row, label in rows]


# ============================================================================ soạn nháp
def _check_key(kind: str, key: str, data) -> None:
    parts = key.split("/")
    limits = {"symptoms": (SYMPTOM_CODE_MAX,), "conditions": (CONDITION_CODE_MAX,),
              "relations": (CONDITION_CODE_MAX, SYMPTOM_CODE_MAX), "excerpts": (SLUG_KEY_MAX,),
              "rules": (SLUG_KEY_MAX,)}[kind]
    if len(parts) != len(limits) or any(not SLUG_RE.match(p) or len(p) > n for p, n in zip(parts, limits)):
        raise AppError(422, "INVALID_KEY", "Mã chỉ gồm chữ thường không dấu, số và dấu gạch dưới",
                       [{"field": "key", "in": "path", "value": key}])
    if kind == "rules":
        try:
            check_rule_key(key, data.rule_type)
        except ValueError as e:
            raise AppError(422, "INVALID_KEY", str(e), [{"field": "rule_key", "in": "path"}]) from None


def _available(db: Session, rel: KnowledgeRelease, kind: str, codes: set[str]) -> set[str]:
    """Mã đang Active hoặc đang soạn trong bản nháp này."""
    if not codes:
        return set()
    model, keycols, _, _ = KINDS[kind]
    col = getattr(model, keycols[0])
    return set(db.scalars(select(col).where(col.in_(codes), or_(model.status == "Active",
                                                                 (model.release_id == rel.release_id)
                                                                 & model.status.in_(OPEN_STATUSES)))))


def _require(db, rel, kind: str, codes: set[str], field: str) -> None:
    missing = sorted(codes - _available(db, rel, kind, codes))
    if missing:
        raise AppError(422, "UNKNOWN_CODE", "Mã chưa có trong tri thức Active hoặc bản nháp này",
                       [{"field": field, "value": c} for c in missing])


def _cross_check(db: Session, rel: KnowledgeRelease, kind: str, key: str, values: dict[str, Any]) -> None:
    if "source_id" in values:
        src = db.get(KnowledgeSource, values["source_id"])
        if src is None or not src.is_active:
            raise AppError(422, "UNKNOWN_SOURCE", "Nguồn không tồn tại hoặc đã ngừng dùng",
                           [{"field": "source_id", "in": "body"}])
    if kind == "relations":
        cond, sym = key.split("/")
        _require(db, rel, "conditions", {cond}, "condition_code")
        _require(db, rel, "symptoms", {sym}, "symptom_code")
    elif kind == "excerpts":
        _require(db, rel, "conditions", {values["condition_code"]}, "condition_code")
    elif kind == "rules":
        _require(db, rel, "symptoms", logic_symptom_codes(values["condition_logic"]), "condition_logic")


def put_draft(db: Session, kind: str, key: str, data, actor: User) -> dict[str, Any]:
    """``data`` là schema Draft tương ứng (đã được FastAPI kiểm)."""
    model, keycols, cols, table = _model(kind)
    if not isinstance(data, DRAFT_SCHEMAS[kind]):
        data = DRAFT_SCHEMAS[kind].model_validate(data)
    _check_key(kind, key, data)
    rel = open_release(db, lock=True)
    if rel is None:
        raise AppError(409, "NO_OPEN_RELEASE", "Chưa có bản phát hành đang soạn; tạo bản mới trước")
    if rel.status != "Draft":
        raise AppError(409, "RELEASE_LOCKED", "Bản phát hành đang chờ duyệt, không sửa được",
                       [{"release_id": str(rel.release_id), "label": rel.label}])
    values = {c: getattr(data, c) for c in cols}
    _cross_check(db, rel, kind, key, values)

    where = _where_key(kind, key)
    draft = db.scalar(select(model).where(*where, model.release_id == rel.release_id, model.status == "Draft")
                      .with_for_update())
    active = db.scalar(select(model).where(*where, model.status == "Active"))
    if draft is None and active is not None and all(
            _plain(getattr(active, c)) == _plain(v) for c, v in values.items()):
        raise AppError(422, "NO_CHANGE", "Nội dung giống bản đang dùng, không cần tạo phiên bản mới")
    if draft is None:
        latest = db.scalar(select(func.max(model.version)).where(*where)) or 0
        keyvals = dict(zip(keycols, key.split("/")))
        draft = model(**keyvals, **values, version=latest + 1, status="Draft", release_id=rel.release_id,
                      created_by=actor.user_id)
        db.add(draft)
        action = "CREATE"
    else:
        for c, v in values.items():
            setattr(draft, c, v)
        action = "UPDATE"
    db.flush()
    audit.record(db, action=action, entity=table, entity_id=_row_id(draft), actor_id=actor.user_id,
                 new_values={"key": key, "version": draft.version, "release": rel.label})
    return item_out(kind, draft, rel.label)


def _row_id(row) -> uuid.UUID:
    for attr in ("symptom_id", "condition_id", "relation_id", "excerpt_id", "triage_rule_id"):
        if hasattr(row, attr):
            return getattr(row, attr)
    raise AttributeError


def drop_draft(db: Session, kind: str, key: str, actor: User) -> None:
    """Bỏ một mục khỏi bản nháp (không xóa dòng: CSDL không cho DELETE; đánh dấu Retired)."""
    model, _, _, table = _model(kind)
    rel = open_release(db, lock=True)
    if rel is None or rel.status != "Draft":
        raise AppError(409, "NO_OPEN_RELEASE", "Không có bản phát hành đang soạn")
    draft = db.scalar(select(model).where(*_where_key(kind, key), model.release_id == rel.release_id,
                                          model.status == "Draft"))
    if draft is None:
        raise NotFoundError("Mục này không có trong bản nháp")
    draft.status, draft.retired_by, draft.retired_at, draft.retired_reason = (
        "Retired", actor.user_id, func.now(), "Deactivated")
    db.flush()
    audit.record(db, action="UPDATE", entity=table, entity_id=_row_id(draft), actor_id=actor.user_id,
                 new_values={"key": key, "dropped_from_draft": rel.label})


# ============================================================================ tắt khẩn cấp
def _active_row(db: Session, kind: str, key: str):
    model = _model(kind)[0]
    row = db.scalar(select(model).where(*_where_key(kind, key), model.status == "Active").with_for_update())
    if row is None:
        raise NotFoundError("Không có mục đang dùng (Active) với mã này")
    return row


def dependents(db: Session, kind: str, key: str) -> list[dict[str, str]]:
    """Mục Active sẽ bị tắt theo: triệu chứng -> quan hệ + luật dùng nó; bệnh -> quan hệ + trích dẫn."""
    _active_row(db, kind, key)
    out: list[dict[str, str]] = []
    if kind == "symptoms":
        out += [{"kind": "relations", "key": key_of("relations", r)} for r in db.scalars(
            select(ConditionSymptom).where(ConditionSymptom.symptom_code == key, ConditionSymptom.status == "Active"))]
        rows = db.execute(text("SELECT rule_key FROM triage_rule WHERE status = 'Active' AND "
                               "jsonb_path_exists(condition_logic, '$.**.symptom_code ? (@ == $c)', "
                               "jsonb_build_object('c', CAST(:c AS text)))"), {"c": key}).scalars()
        out += [{"kind": "rules", "key": k} for k in rows]
    elif kind == "conditions":
        out += [{"kind": "relations", "key": key_of("relations", r)} for r in db.scalars(
            select(ConditionSymptom).where(ConditionSymptom.condition_code == key, ConditionSymptom.status == "Active"))]
        out += [{"kind": "excerpts", "key": e} for e in db.scalars(
            select(GuidelineExcerpt.excerpt_key).where(GuidelineExcerpt.condition_code == key,
                                                       GuidelineExcerpt.status == "Active"))]
    return sorted(out, key=lambda d: (ORDER.index(d["kind"]), d["key"]))


def deactivate(db: Session, kind: str, key: str, data: DeactivateRequest, actor: User) -> list[dict[str, str]]:
    deps = dependents(db, kind, key)
    sent = sorted(({"kind": d.kind, "key": d.key} for d in data.confirm_dependents),
                  key=lambda d: (ORDER.index(d["kind"]), d["key"]))
    if sent != deps:
        raise AppError(409, "DEPENDENTS_CHANGED",
                       "Danh sách mục bị tắt theo đã thay đổi; xem lại và xác nhận lại", deps)
    now = func.now()
    for d in [{"kind": kind, "key": key}, *deps]:
        model = KINDS[d["kind"]][0]
        db.execute(update(model).where(*_where_key(d["kind"], d["key"]), model.status == "Active")
                   .values(status="Retired", retired_by=actor.user_id, retired_at=now, retired_reason="Deactivated"))
    db.flush()
    audit.record(db, action="RETIRE", entity=KINDS[kind][3], entity_id=None, actor_id=actor.user_id,
                 new_values={"key": key, "reason": data.reason, "cascade": deps})
    return deps


# ============================================================================ nguồn
def list_sources(db: Session) -> list[KnowledgeSource]:
    return list(db.scalars(select(KnowledgeSource).order_by(KnowledgeSource.organization, KnowledgeSource.edition)))


def create_source(db: Session, data: SourceCreate, actor: User) -> KnowledgeSource:
    if db.scalar(select(KnowledgeSource.source_id).where(KnowledgeSource.organization == data.organization,
                                                         KnowledgeSource.edition == data.edition)):
        raise AppError(409, "DUPLICATE_SOURCE", "Đã có nguồn cùng tổ chức và số hiệu văn bản",
                       [{"field": "edition", "in": "body"}])
    src = KnowledgeSource(**data.model_dump(), created_by=actor.user_id)
    db.add(src)
    db.flush()
    audit.record(db, action="CREATE", entity="knowledge_source", entity_id=src.source_id, actor_id=actor.user_id,
                 new_values={"organization": src.organization, "edition": src.edition})
    return src
