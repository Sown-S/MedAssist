"""Lượt khám và hàng đợi (US10, FR10) — máy trạng thái của VISIT (ERD v1.8 mục 2.10).

    Waiting --check_in--> CheckedIn --start_exam--> Examining --mark_prescribed--> Prescribed
                                                         |                              |
                                        release (về CheckedIn)              mark_finished --> Finished
    Cancelled: Nurse khi Waiting/CheckedIn; Physician khi Examining của chính mình;
               (bước 5) Nurse khi Prescribed nếu chưa cấp thuốc và chưa thu tiền.

* Mỗi lần chuyển là MỘT câu UPDATE có điều kiện (WHERE status = ...): hai người bấm cùng lúc thì
  chỉ một người thắng, người kia nhận 409 — không cần khóa ở tầng ứng dụng.
* mark_prescribed / mark_finished là hàm NỘI BỘ: service đơn thuốc và hóa đơn (bước 5) gọi,
  cùng transaction với việc xác nhận đơn / thu tiền. Không có API gọi thẳng.
* Mọi lần chuyển ghi AUDIT_LOG UPDATE (trạng thái cũ -> mới) trong cùng transaction.
"""
import uuid

from sqlalchemy import case, func, select, text, update
from sqlalchemy.orm import Session

from app.exceptions import AppError, NotFoundError
from app.models import Diagnosis, Patient, User, Visit
from app.schemas.visit import VisitCreate, VisitUpdate
from app.services import audit_service as audit

OPEN_STATUSES = ("Waiting", "CheckedIn", "Examining", "Prescribed")
QUEUE_STATUSES = ("Waiting", "CheckedIn")
_QUEUE_LOCK_KEY = 4_206_202_610          # khóa advisory cấp số thứ tự trong ngày

# Thứ tự ưu tiên hàng đợi: chưa phân luồng (NULL) xếp như Routine
_PRIORITY_RANK = case((Visit.triage_priority == "Emergency", 3),
                      (Visit.triage_priority == "HighPriority", 2), else_=1)


def get_visit(db: Session, visit_id: uuid.UUID) -> Visit:
    visit = db.get(Visit, visit_id)
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    return visit


def _transition(db: Session, visit_id: uuid.UUID, actor: User, *, from_status: tuple[str, ...],
                to_status: str, values: dict, extra_where=(), audit_extra: dict | None = None,
                conflict_code: str = "INVALID_TRANSITION") -> Visit:
    """UPDATE có điều kiện + ghi nhật ký. 404 nếu không có lượt khám, 409 nếu sai trạng thái."""
    stmt = (update(Visit)
            .where(Visit.visit_id == visit_id, Visit.status.in_(from_status), *extra_where)
            .values(status=to_status, updated_at=func.now(), **values)
            .returning(Visit.visit_id))
    old_status = db.scalar(select(Visit.status).where(Visit.visit_id == visit_id))
    if old_status is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    if db.scalar(stmt) is None:
        current = db.scalar(select(Visit.status).where(Visit.visit_id == visit_id))
        raise AppError(409, conflict_code,
                       f"Không thể chuyển lượt khám từ '{current}' sang '{to_status}'",
                       [{"field": "status", "current": current, "allowed_from": list(from_status)}])
    audit.record(db, action="UPDATE", entity="visit", entity_id=visit_id, actor_id=actor.user_id,
                 old_values={"status": old_status},
                 new_values={"status": to_status, **(audit_extra or {})})
    visit = db.get(Visit, visit_id)
    db.refresh(visit)
    return visit


# ---------------------------------------------------------------------------- tạo / sửa
def create_visit(db: Session, data: VisitCreate, actor: User) -> Visit:
    if db.get(Patient, data.patient_id) is None:
        raise NotFoundError("Không tìm thấy bệnh nhân")

    # Khóa theo transaction: cả kiểm tra lượt đang mở lẫn cấp số thứ tự đều tuần tự
    db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _QUEUE_LOCK_KEY})
    open_visit = db.scalar(select(Visit.visit_id).where(Visit.patient_id == data.patient_id,
                                                        Visit.status.in_(OPEN_STATUSES)))
    if open_visit:
        raise AppError(409, "PATIENT_HAS_OPEN_VISIT", "Bệnh nhân đang có một lượt khám chưa kết thúc",
                       [{"visit_id": str(open_visit)}])
    next_number = db.scalar(select(func.coalesce(func.max(Visit.queue_number), 0) + 1)
                            .where(Visit.queue_date == func.current_date()))

    visit = Visit(patient_id=data.patient_id, nurse_id=actor.user_id, queue_number=next_number,
                  chief_complaint=data.chief_complaint,
                  vital_signs=data.vital_signs.to_db() if data.vital_signs else None,
                  free_text_description=data.free_text_description)
    db.add(visit)
    db.flush()
    db.refresh(visit)
    audit.record(db, action="CREATE", entity="visit", entity_id=visit.visit_id, actor_id=actor.user_id,
                 new_values={"patient_id": str(visit.patient_id), "queue_number": visit.queue_number,
                             "status": visit.status,
                             "vital_sign_keys": sorted(visit.vital_signs or {})})
    return visit


def update_visit(db: Session, visit_id: uuid.UUID, data: VisitUpdate, actor: User) -> Visit:
    visit = db.scalar(select(Visit).where(Visit.visit_id == visit_id).with_for_update())
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    if visit.status != "Waiting":
        raise AppError(409, "VISIT_LOCKED", "Chỉ sửa được lượt khám khi còn ở trạng thái chờ (Waiting)")
    changes = data.model_dump(exclude_unset=True)
    if "vital_signs" in changes:
        changes["vital_signs"] = data.vital_signs.to_db() if data.vital_signs else None
    if changes.get("chief_complaint", "") is None:
        raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                       [{"field": "chief_complaint", "in": "body", "message": "Không được để trống"}])
    changed = [k for k, v in changes.items() if getattr(visit, k) != v]
    for k in changed:
        setattr(visit, k, changes[k])
    if changed:
        visit.updated_at = func.now()
        audit.record(db, action="UPDATE", entity="visit", entity_id=visit.visit_id,
                     actor_id=actor.user_id, new_values={"changed_fields": sorted(changed)})
        db.flush()
        db.refresh(visit)
    return visit


# ---------------------------------------------------------------------------- chuyển trạng thái (API)
def check_in(db: Session, visit_id: uuid.UUID, actor: User) -> Visit:
    return _transition(db, visit_id, actor, from_status=("Waiting",), to_status="CheckedIn",
                       values={"checked_in_at": func.now()},
                       extra_where=(Visit.queue_date == func.current_date(),))


def start_exam(db: Session, visit_id: uuid.UUID, actor: User) -> Visit:
    """Bác sĩ nhận khám: chỉ một bác sĩ thắng (WHERE physician_id IS NULL)."""
    return _transition(db, visit_id, actor, from_status=("CheckedIn",), to_status="Examining",
                       values={"physician_id": actor.user_id, "exam_started_at": func.now()},
                       extra_where=(Visit.physician_id.is_(None),), conflict_code="VISIT_TAKEN")


def release(db: Session, visit_id: uuid.UUID, actor: User) -> Visit:
    """Bác sĩ trả lượt khám của mình về hàng đợi (nhận nhầm). Không được khi đã có chẩn đoán."""
    if db.scalar(select(Diagnosis.diagnosis_id).where(Diagnosis.visit_id == visit_id).limit(1)):
        raise AppError(409, "HAS_DIAGNOSIS", "Lượt khám đã có chẩn đoán, không thể trả về hàng đợi")
    return _transition(db, visit_id, actor, from_status=("Examining",), to_status="CheckedIn",
                       values={"physician_id": None, "exam_started_at": None},
                       extra_where=(Visit.physician_id == actor.user_id,), conflict_code="NOT_YOUR_VISIT")


def cancel(db: Session, visit_id: uuid.UUID, reason: str, actor: User) -> Visit:
    """Nurse: Waiting/CheckedIn. Physician: Examining do chính mình nhận. Lý do lưu trong audit_log."""
    if actor.role == "Nurse":
        allowed, where = ("Waiting", "CheckedIn"), ()
    elif actor.role == "Physician":
        allowed, where = ("Examining",), (Visit.physician_id == actor.user_id,)
    else:
        raise AppError(403, "FORBIDDEN", "Bạn không có quyền hủy lượt khám")
    return _transition(db, visit_id, actor, from_status=allowed, to_status="Cancelled",
                       values={"finished_at": func.now()}, extra_where=where,
                       audit_extra={"reason": reason})


# ---------------------------------------------------------------------------- hàm nội bộ cho bước 5
def mark_prescribed(db: Session, visit_id: uuid.UUID, actor: User) -> Visit:
    """Examining -> Prescribed. Gọi khi: đơn thuốc được xác nhận (đã trừ kho), HOẶC bác sĩ bấm
    'Hoàn tất khám' không kê đơn (Prescribed = khám xong, chờ thu tiền). Cần >= 1 chẩn đoán đã
    xác nhận (US02). Chỉ bác sĩ đang khám lượt này."""
    has_dx = db.scalar(select(Diagnosis.diagnosis_id).where(
        Diagnosis.visit_id == visit_id, Diagnosis.confirmed_by_physician.is_(True)).limit(1))
    if not has_dx:
        raise AppError(409, "DIAGNOSIS_REQUIRED", "Cần xác nhận ít nhất một chẩn đoán trước khi kết thúc khám")
    return _transition(db, visit_id, actor, from_status=("Examining",), to_status="Prescribed",
                       values={}, extra_where=(Visit.physician_id == actor.user_id,),
                       conflict_code="NOT_YOUR_VISIT")


def mark_finished(db: Session, visit_id: uuid.UUID, actor: User) -> Visit:
    """Prescribed -> Finished. Service hóa đơn (bước 5) gọi khi hóa đơn đã Paid VÀ mọi dòng thuốc
    đã Dispensed/Skipped — điều kiện đó do service hóa đơn kiểm tra trong cùng transaction."""
    return _transition(db, visit_id, actor, from_status=("Prescribed",), to_status="Finished",
                       values={"finished_at": func.now()})


# ---------------------------------------------------------------------------- truy vấn
def queue_today(db: Session) -> list[dict]:
    rows = db.execute(
        select(Visit, Patient.full_name, Patient.date_of_birth, Patient.gender)
        .join(Patient, Patient.patient_id == Visit.patient_id)
        .where(Visit.queue_date == func.current_date(), Visit.status.in_(QUEUE_STATUSES))
        .order_by(_PRIORITY_RANK.desc(), Visit.visit_date, Visit.queue_number)).all()
    return [{**{k: getattr(v, k) for k in ("visit_id", "queue_number", "status", "patient_id",
                                           "chief_complaint", "triage_priority", "is_red_flag",
                                           "red_flag_reason", "priority_raised_by_ai", "ai_status",
                                           "visit_date", "checked_in_at")},
             "patient_name": name, "date_of_birth": dob, "gender": gender}
            for v, name, dob, gender in rows]


def stale_open_visits(db: Session) -> list[Visit]:
    """Lượt khám còn mở từ những ngày trước (không hiện trong hàng đợi hôm nay)."""
    return list(db.scalars(select(Visit).where(Visit.queue_date < func.current_date(),
                                               Visit.status.in_(QUEUE_STATUSES))
                           .order_by(Visit.queue_date, Visit.queue_number)))


def cancel_stale(db: Session, visit_ids: list[uuid.UUID], reason: str, actor: User) -> list[uuid.UUID]:
    done = []
    today = db.scalar(select(func.current_date()))       # ngày theo múi giờ CSDL (Asia/Ho_Chi_Minh)
    for vid in dict.fromkeys(visit_ids):
        visit = db.get(Visit, vid)
        if visit is None or visit.queue_date >= today or visit.status not in QUEUE_STATUSES:
            raise AppError(409, "NOT_STALE", "Chỉ hủy hàng loạt được lượt khám còn mở của ngày trước",
                           [{"visit_id": str(vid)}])
        cancel(db, vid, reason, actor)
        done.append(vid)
    return done


def patient_history(db: Session, patient_id: uuid.UUID, limit: int, offset: int) -> tuple[int, list[Visit]]:
    stmt = select(Visit).where(Visit.patient_id == patient_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Visit.visit_date.desc()).limit(limit).offset(offset)).all()
    return total or 0, list(rows)
