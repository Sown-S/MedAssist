"""Lượt khám và hàng đợi (US10, FR10) — máy trạng thái của VISIT (ERD v1.8 mục 2.10).

    Waiting --check_in--> CheckedIn --start_exam--> Examining --mark_prescribed--> Prescribed
                                                         |                              |
                                        release (về CheckedIn)              mark_finished --> Finished
    Cancelled: Nurse khi Waiting/CheckedIn; Physician khi Examining của chính mình;
               (bước 5) Nurse khi Prescribed nếu chưa cấp thuốc và chưa thu tiền.
    Chuyển tuyến (ERD v2.0): Finished + outcome = Referred, từ Examining (Physician của lượt)
               hoặc Waiting/CheckedIn (Nurse); không qua Prescribed, không có hóa đơn.

* Mỗi lần chuyển là MỘT câu UPDATE có điều kiện (WHERE status = ...): hai người bấm cùng lúc thì
  chỉ một người thắng, người kia nhận 409 — không cần khóa ở tầng ứng dụng.
* mark_prescribed / mark_finished là hàm NỘI BỘ: service đơn thuốc và hóa đơn (bước 5) gọi,
  cùng transaction với việc xác nhận đơn / thu tiền. Không có API gọi thẳng.
* Mọi lần chuyển ghi AUDIT_LOG UPDATE (trạng thái cũ -> mới) trong cùng transaction.
"""
import datetime
import uuid

from sqlalchemy import case, func, or_, select, text, update
from sqlalchemy.orm import Session, aliased

from app.exceptions import AppError, NotFoundError
from app.models import Diagnosis, Patient, Prescription, ReferralFacility, Room, User, Visit
from app.schemas.visit import EmergencyReferralCreate, ReferralIn, ReferralUpdate, VisitCreate, VisitUpdate
from app.services import audit_service as audit

OPEN_STATUSES = ("Waiting", "CheckedIn", "Examining", "Prescribed")
QUEUE_STATUSES = ("Waiting", "CheckedIn")
QUEUE_VIEW_STATUSES = (*QUEUE_STATUSES, "Examining")    # màn lễ tân thấy cả người đang trong phòng
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
            .values(status=to_status, updated_at=func.now(), **values,
                    **({} if to_status == "Examining" else {"lab_out_at": None}))
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
    changes = data.model_dump(exclude_unset=True)
    # Sau check-in vẫn cho đo lại sinh hiệu để luật tính lại mức ưu tiên khi bệnh nhân chuyển nặng.
    vitals_only = visit.status == "CheckedIn" and set(changes) <= {"vital_signs"}
    if visit.status != "Waiting" and not vitals_only:
        raise AppError(409, "VISIT_LOCKED",
                       "Chỉ sửa được lượt khám khi còn chờ (Waiting); sau check-in chỉ sửa được sinh hiệu")
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
                       values={"physician_id": None, "exam_started_at": None, "called_at": None,
                               "called_by": None},
                       extra_where=(Visit.physician_id == actor.user_id,), conflict_code="NOT_YOUR_VISIT")


def cancel(db: Session, visit_id: uuid.UUID, reason: str, actor: User) -> Visit:
    """Nurse: Waiting/CheckedIn, hoặc Prescribed khi bệnh nhân bỏ về (billing_service hoàn kho, hủy đơn và
    hóa đơn). Physician: Examining do chính mình nhận. Lý do lưu trong audit_log."""
    if actor.role == "Nurse" and db.scalar(select(Visit.status).where(Visit.visit_id == visit_id)) == "Prescribed":
        from app.services import billing_service      # import muộn: tránh vòng import
        return billing_service.cancel_prescribed(db, visit_id, reason, actor)
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


def cancel_from_prescribed(db: Session, visit_id: uuid.UUID, reason: str, actor: User) -> Visit:
    return _transition(db, visit_id, actor, from_status=("Prescribed",), to_status="Cancelled",
                       values={"finished_at": func.now()}, audit_extra={"reason": reason})


def reopen_exam(db: Session, visit_id: uuid.UUID, actor: User) -> Visit:
    """Prescribed -> Examining khi bác sĩ 'mở lại đơn' (prescription_service kiểm tra điều kiện:
    chưa cấp thuốc, chưa thu tiền). Chỉ bác sĩ đã khám lượt này."""
    return _transition(db, visit_id, actor, from_status=("Prescribed",), to_status="Examining",
                       values={}, extra_where=(Visit.physician_id == actor.user_id,),
                       conflict_code="NOT_YOUR_VISIT")


def mark_finished(db: Session, visit_id: uuid.UUID, actor: User) -> Visit:
    """Prescribed -> Finished. Service hóa đơn (bước 5) gọi khi hóa đơn đã Paid VÀ mọi dòng thuốc
    đã Dispensed/Skipped — điều kiện đó do service hóa đơn kiểm tra trong cùng transaction."""
    return _transition(db, visit_id, actor, from_status=("Prescribed",), to_status="Finished",
                       values={"finished_at": func.now()})


# ---------------------------------------------------------------------------- chuyển tuyến (ERD v2.0)
def _check_facility(db: Session, facility_id: uuid.UUID | None) -> None:
    if facility_id is None:
        return
    facility = db.get(ReferralFacility, facility_id)
    if facility is None or not facility.is_active:
        raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                       [{"field": "facility_id", "in": "body", "message": "Cơ sở không có trong danh mục"}])


def _referral_payload(db: Session, data: ReferralIn, actor: User) -> dict:
    _check_facility(db, data.facility_id)
    return {**data.model_dump(mode="json", exclude_none=True), "referred_by": str(actor.user_id),
            "referred_by_name": actor.full_name, "referred_by_role": actor.role,
            "referred_at": datetime.datetime.now(datetime.UTC).isoformat()}


def refer(db: Session, visit_id: uuid.UUID, data: ReferralIn, actor: User) -> Visit:
    """Physician: lượt Examining của mình. Nurse: lượt Waiting/CheckedIn (chuyển nặng lúc chờ)."""
    if actor.role == "Physician":
        allowed, where, code = ("Examining",), (Visit.physician_id == actor.user_id,), "NOT_YOUR_VISIT"
    else:
        allowed, where, code = ("Waiting", "CheckedIn"), (), "INVALID_TRANSITION"
    referral = _referral_payload(db, data, actor)
    visit = _transition(db, visit_id, actor, from_status=allowed, to_status="Finished",
                        values={"finished_at": func.now(), "outcome": "Referred", "referral": referral},
                        extra_where=where, conflict_code=code,
                        audit_extra={"outcome": "Referred", "facility_name": referral["facility_name"]})
    # Đơn nháp chưa trừ kho: bỏ để lượt đã đóng không còn đơn treo
    draft = db.scalar(select(Prescription).where(Prescription.visit_id == visit_id, Prescription.status == "Draft"))
    if draft is not None:
        draft.status, draft.cancelled_at = "Cancelled", func.now()
        audit.record(db, action="UPDATE", entity="prescription", entity_id=draft.prescription_id,
                     actor_id=actor.user_id, old_values={"status": "Draft"},
                     new_values={"status": "Cancelled", "reason": "Referred"})
        db.flush()
    return visit


def emergency_referral(db: Session, data: EmergencyReferralCreate, actor: User) -> Visit:
    """Cấp cứu phát hiện ở quầy: tạo lượt khám rồi chuyển tuyến ngay trong cùng transaction."""
    visit = create_visit(db, VisitCreate(patient_id=data.patient_id, chief_complaint=data.chief_complaint,
                                         vital_signs=data.vital_signs), actor)
    return refer(db, visit.visit_id, data.referral, actor)


def update_referral(db: Session, visit_id: uuid.UUID, data: ReferralUpdate, actor: User) -> Visit:
    visit = db.scalar(select(Visit).where(Visit.visit_id == visit_id).with_for_update())
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    if visit.outcome != "Referred":
        raise AppError(409, "NOT_REFERRED", "Lượt khám này không chuyển tuyến")
    changes = data.model_dump(mode="json", exclude_unset=True, exclude_none=True)
    _check_facility(db, data.facility_id)
    changed = sorted(k for k, v in changes.items() if visit.referral.get(k) != v)
    if changed:
        visit.referral = {**visit.referral, **changes, "amended_by": str(actor.user_id),
                          "amended_by_name": actor.full_name,
                          "amended_at": datetime.datetime.now(datetime.UTC).isoformat()}
        visit.updated_at = func.now()
        audit.record(db, action="UPDATE", entity="visit", entity_id=visit_id, actor_id=actor.user_id,
                     new_values={"referral_fields": changed})
        db.flush()
        db.refresh(visit)
    return visit


def search_facilities(db: Session, q: str, limit: int) -> list[ReferralFacility]:
    key = func.lower(func.f_unaccent(ReferralFacility.name))
    term = func.lower(func.f_unaccent(q))
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return list(db.scalars(
        select(ReferralFacility)
        .where(ReferralFacility.is_active,
               or_(key.like("%" + func.lower(func.f_unaccent(escaped)) + "%", escape="\\"),
                   ReferralFacility.kcb_code == q))
        .order_by(func.similarity(key, term).desc(), ReferralFacility.name).limit(limit)))


# ---------------------------------------------------------------------------- xét nghiệm, mời vào phòng
def own_examining(db: Session, visit_id: uuid.UUID, actor: User) -> Visit:
    visit = db.scalar(select(Visit).where(Visit.visit_id == visit_id).with_for_update())
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    if visit.status != "Examining" or visit.physician_id != actor.user_id:
        raise AppError(409, "NOT_YOUR_VISIT", "Chỉ bác sĩ đang khám lượt này mới thao tác được",
                       [{"current": visit.status}])
    return visit


def set_lab_out(db: Session, visit_id: uuid.UUID, out: bool, actor: User) -> Visit:
    """Bệnh nhân đi xét nghiệm (lượt vẫn Examining của bác sĩ) hoặc đã quay lại phòng."""
    visit = own_examining(db, visit_id, actor)
    if (visit.lab_out_at is not None) == out:
        return visit
    visit.lab_out_at = func.now() if out else None
    visit.updated_at = func.now()
    audit.record(db, action="UPDATE", entity="visit", entity_id=visit_id, actor_id=actor.user_id,
                 new_values={"lab_out": out})
    db.flush()
    db.refresh(visit)
    return visit


def _active_call(db: Session, actor: User) -> uuid.UUID | None:
    return db.scalar(select(Visit.visit_id).where(Visit.called_by == actor.user_id,
                                                  Visit.status.in_(QUEUE_STATUSES),
                                                  Visit.physician_id.is_(None)).limit(1))


def _stamp_call(db: Session, visit: Visit, actor: User, recall: bool) -> Visit:
    visit.called_at, visit.called_by, visit.updated_at = func.now(), actor.user_id, func.now()
    audit.record(db, action="UPDATE", entity="visit", entity_id=visit.visit_id, actor_id=actor.user_id,
                 new_values={"call": "recall" if recall else "call"})
    db.flush()
    db.refresh(visit)
    return visit


def call_next(db: Session, actor: User) -> Visit:
    """Bác sĩ sẵn sàng: chọn người kế tiếp theo đúng thứ tự hàng đợi, quầy nhận tín hiệu qua GET /queue."""
    active = _active_call(db, actor)
    if active:
        raise AppError(409, "ACTIVE_CALL", "Bạn đang mời một bệnh nhân chưa vào phòng",
                       [{"visit_id": str(active)}])
    visit = db.scalar(
        select(Visit).where(Visit.queue_date == func.current_date(), Visit.status.in_(QUEUE_STATUSES),
                            Visit.physician_id.is_(None), Visit.called_at.is_(None))
        .order_by(_PRIORITY_RANK.desc(), Visit.visit_date, Visit.queue_number)
        .limit(1).with_for_update(skip_locked=True))
    if visit is None:
        raise AppError(409, "QUEUE_EMPTY", "Không còn bệnh nhân chờ khám")
    return _stamp_call(db, visit, actor, recall=False)


def call(db: Session, visit_id: uuid.UUID, actor: User) -> Visit:
    """Mời đích danh hoặc gọi lại; không giành người bác sĩ khác đang mời."""
    visit = db.scalar(select(Visit).where(Visit.visit_id == visit_id).with_for_update())
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    if visit.status not in QUEUE_STATUSES or visit.physician_id is not None:
        raise AppError(409, "INVALID_TRANSITION", "Bệnh nhân không còn chờ khám", [{"current": visit.status}])
    if visit.called_by not in (None, actor.user_id):
        raise AppError(409, "CALLED_BY_OTHER", "Bác sĩ khác đang mời bệnh nhân này")
    active = _active_call(db, actor)
    if active and active != visit_id:
        raise AppError(409, "ACTIVE_CALL", "Bạn đang mời một bệnh nhân chưa vào phòng",
                       [{"visit_id": str(active)}])
    return _stamp_call(db, visit, actor, recall=visit.called_by is not None)


def cancel_call(db: Session, visit_id: uuid.UUID, actor: User) -> Visit:
    """Bệnh nhân không có mặt: bỏ lời mời, lượt khám về lại hàng đợi như cũ."""
    visit = db.scalar(select(Visit).where(Visit.visit_id == visit_id).with_for_update())
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    if visit.called_at is None or visit.status not in QUEUE_STATUSES:
        raise AppError(409, "NOT_CALLED", "Lượt khám không ở trạng thái đang mời")
    if actor.role == "Physician" and visit.called_by != actor.user_id:
        raise AppError(409, "CALLED_BY_OTHER", "Bác sĩ khác đang mời bệnh nhân này")
    visit.called_at, visit.called_by, visit.updated_at = None, None, func.now()
    audit.record(db, action="UPDATE", entity="visit", entity_id=visit_id, actor_id=actor.user_id,
                 new_values={"call": "cancelled"})
    db.flush()
    db.refresh(visit)
    return visit


# ---------------------------------------------------------------------------- truy vấn
def _queue_rows(db: Session, *where, order_by=None) -> list[dict]:
    caller, caller_room = aliased(User), aliased(Room)
    rows = db.execute(
        select(Visit, Patient.full_name, Patient.date_of_birth, Patient.gender, User.full_name, Room.code, Room.name,
               caller.full_name, caller_room.code, caller_room.name)
        .join(Patient, Patient.patient_id == Visit.patient_id)
        .outerjoin(User, User.user_id == Visit.physician_id)
        .outerjoin(Room, Room.room_id == User.room_id)
        .outerjoin(caller, caller.user_id == Visit.called_by)
        .outerjoin(caller_room, caller_room.room_id == caller.room_id)
        .where(*where)
        .order_by(*(order_by or (_PRIORITY_RANK.desc(), Visit.visit_date, Visit.queue_number)))).all()
    return [{**{k: getattr(v, k) for k in ("visit_id", "queue_date", "queue_number", "status", "patient_id",
                                           "chief_complaint", "triage_priority", "is_red_flag",
                                           "red_flag_reason", "priority_raised_by_ai", "ai_status",
                                           "visit_date", "checked_in_at", "physician_id", "exam_started_at",
                                           "lab_out_at", "called_at", "called_by", "finished_at", "outcome")},
             "referred_by_role": (v.referral or {}).get("referred_by_role"),
             "patient_name": name, "date_of_birth": dob, "gender": gender, "physician_name": physician,
             "room": room, "room_name": room_name, "called_by_name": caller_name,
             "called_room": c_room, "called_room_name": c_room_name}
            for v, name, dob, gender, physician, room, room_name, caller_name, c_room, c_room_name in rows]


def queue_today(db: Session, include_closed: bool = False) -> list[dict]:
    # Lượt Examining của ngày trước vẫn hiện: khám vắt qua nửa đêm không được rơi khỏi phòng bác sĩ.
    today = or_(Visit.queue_date == func.current_date(), Visit.status == "Examining")
    if include_closed:
        return _queue_rows(db, today)
    return _queue_rows(db, Visit.status.in_(QUEUE_VIEW_STATUSES), today)


def stale_open_visits(db: Session) -> list[dict]:
    """Lượt chờ khám còn mở từ những ngày trước (không hiện trong hàng đợi hôm nay)."""
    return _queue_rows(db, Visit.queue_date < func.current_date(), Visit.status.in_(QUEUE_STATUSES),
                       order_by=(Visit.queue_date, Visit.queue_number))


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
