"""Xác nhận triệu chứng của lượt khám (HITL). Chỉ nhận mã đang Active; ghi đúng dòng phiên bản
(symptom_id) đang dùng, nhờ FK kép visit_symptom -> symptom (symptom_id, symptom_code).

Nhật ký: chỉ ghi số lượng theo trạng thái, không ghi mã triệu chứng (dữ liệu lâm sàng)."""
import uuid
from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.exceptions import AppError
from app.models import Symptom, User, Visit, VisitSymptom
from app.schemas.visit_symptom import SymptomsPut
from app.services import audit_service as audit
from app.services.queue_service import get_visit
from app.validation.knowledge_validators import active_symptoms

EDITABLE_STATUSES = ("Waiting", "CheckedIn", "Examining")


def list_symptoms(db: Session, visit_id: uuid.UUID) -> list[dict]:
    get_visit(db, visit_id)
    rows = db.execute(select(VisitSymptom, Symptom.symptom_name)
                      .join(Symptom, Symptom.symptom_id == VisitSymptom.symptom_id)
                      .where(VisitSymptom.visit_id == visit_id)
                      .order_by(VisitSymptom.state, VisitSymptom.symptom_code)).all()
    return [{"symptom_code": vs.symptom_code, "symptom_name": name, "state": vs.state, "source": vs.source,
             "confirmed_at": vs.confirmed_at} for vs, name in rows]


def put_symptoms(db: Session, visit_id: uuid.UUID, data: SymptomsPut, actor: User) -> list[dict]:
    visit = db.scalar(select(Visit).where(Visit.visit_id == visit_id).with_for_update())
    if visit is None:
        get_visit(db, visit_id)                      # ném NotFound thống nhất
    if visit.status not in EDITABLE_STATUSES:
        raise AppError(409, "VISIT_CLOSED", "Lượt khám đã kết thúc, không sửa triệu chứng được",
                       [{"current": visit.status}])

    wanted = {s.symptom_code: s for s in data.symptoms}
    catalog = active_symptoms(db, list(wanted)) if wanted else {}      # ném 422 UNKNOWN_SYMPTOM
    existing = {vs.symptom_code: vs for vs in db.scalars(select(VisitSymptom)
                                                          .where(VisitSymptom.visit_id == visit_id))}
    changed = 0
    for code, item in wanted.items():
        row = existing.get(code)
        sym = catalog[code]
        if row is None:
            db.add(VisitSymptom(visit_id=visit_id, symptom_code=code, symptom_id=sym.symptom_id, state=item.state,
                                source=item.source, confirmed_by=actor.user_id))
            changed += 1
        elif (row.state, row.source, row.symptom_id) != (item.state, item.source, sym.symptom_id):
            row.state, row.source, row.symptom_id = item.state, item.source, sym.symptom_id
            row.confirmed_by, row.confirmed_at = actor.user_id, func.now()
            changed += 1
    for code, row in existing.items():               # bỏ khỏi danh sách = chưa rõ
        if code not in wanted and row.state != "UNKNOWN":
            row.state, row.confirmed_by, row.confirmed_at = "UNKNOWN", actor.user_id, func.now()
            changed += 1
    db.flush()
    if changed:
        counts = Counter(s.state for s in data.symptoms)
        audit.record(db, action="UPDATE", entity="visit", entity_id=visit_id, actor_id=actor.user_id,
                     new_values={"symptoms_confirmed": {k: counts.get(k, 0) for k in ("PRESENT", "ABSENT", "UNKNOWN")},
                                 "rows_changed": changed})
    return list_symptoms(db, visit_id)


def active_catalog(db: Session) -> list[dict]:
    """Danh mục triệu chứng Active cho màn tiếp đón (mã OKF chuẩn, dùng cho PUT /visits/{id}/symptoms)."""
    rows = db.execute(select(Symptom.symptom_code, Symptom.symptom_name, Symptom.category)
                      .where(Symptom.status == "Active")
                      .order_by(Symptom.category.nulls_last(), Symptom.symptom_name)).all()
    return [{"symptom_code": c, "symptom_name": n, "category": cat} for c, n, cat in rows]
