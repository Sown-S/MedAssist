"""Khoa phòng (Admin quản lý, mọi vai trò đọc) và ca trực bác sĩ (ERD v1.9 mục 2.1a, 2.1b).

Ca trực chỉ tính trong ngày: ca mở từ hôm trước được đóng khi bác sĩ bắt đầu ca mới hoặc
khi ai đó cần phòng đó, để chỉ mục "một ca mở mỗi bác sĩ / mỗi khoa" không chặn nhầm.
"""
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.exceptions import AppError, NotFoundError
from app.models import Department, DoctorDuty, User, Visit
from app.schemas.department import DepartmentCreate, DepartmentUpdate
from app.services import audit_service as audit


# ---------------------------------------------------------------------------- khoa phòng
def _doctors_by_department(db: Session) -> dict[uuid.UUID, list[dict]]:
    rows = db.execute(select(User.department_id, User.user_id, User.full_name)
                      .where(User.department_id.is_not(None), User.role == "Physician", User.is_active.is_(True))
                      .order_by(User.full_name)).all()
    out: dict[uuid.UUID, list[dict]] = {}
    for dept_id, user_id, name in rows:
        out.setdefault(dept_id, []).append({"user_id": user_id, "full_name": name})
    return out


def _out(dept: Department, doctors: dict) -> dict:
    return {**{k: getattr(dept, k) for k in ("department_id", "code", "name", "room", "is_active", "updated_at")},
            "doctors": doctors.get(dept.department_id, [])}


def list_departments(db: Session, *, include_inactive: bool) -> list[dict]:
    stmt = select(Department).order_by(Department.code)
    if not include_inactive:
        stmt = stmt.where(Department.is_active.is_(True))
    doctors = _doctors_by_department(db)
    return [_out(d, doctors) for d in db.scalars(stmt)]


def get_department(db: Session, department_id: uuid.UUID) -> Department:
    dept = db.get(Department, department_id)
    if dept is None:
        raise NotFoundError("Không tìm thấy khoa phòng")
    return dept


def require_active(db: Session, department_id: uuid.UUID, field: str = "department_id") -> Department:
    dept = db.get(Department, department_id)
    if dept is None or not dept.is_active:
        raise AppError(422, "INVALID_DEPARTMENT", "Khoa phòng không tồn tại hoặc đã ngừng sử dụng",
                       [{"field": field, "in": "body", "message": "Không hợp lệ"}])
    return dept


def _room_taken(db: Session, room: str | None, exclude: uuid.UUID | None = None) -> None:
    if not room:
        return
    stmt = select(Department.code).where(Department.is_active.is_(True), Department.room == room)
    if exclude:
        stmt = stmt.where(Department.department_id != exclude)
    other = db.scalar(stmt)
    if other:
        raise AppError(409, "ROOM_TAKEN", f"Phòng {room} đang thuộc khoa {other}",
                       [{"field": "room", "in": "body", "message": "Đã được dùng"}])


def create_department(db: Session, data: DepartmentCreate, actor: User) -> dict:
    if db.scalar(select(Department.department_id).where(Department.code == data.code)):
        raise AppError(409, "DEPARTMENT_CODE_TAKEN", f"Mã khoa '{data.code}' đã tồn tại",
                       [{"field": "code", "in": "body", "message": "Đã tồn tại"}])
    _room_taken(db, data.room)
    dept = Department(code=data.code, name=data.name, room=data.room)
    db.add(dept)
    db.flush()
    db.refresh(dept)
    audit.record(db, action="CREATE", entity="department", entity_id=dept.department_id, actor_id=actor.user_id,
                 new_values={"code": dept.code, "name": dept.name, "room": dept.room})
    return _out(dept, {})


def update_department(db: Session, department_id: uuid.UUID, data: DepartmentUpdate, actor: User) -> dict:
    dept = db.scalar(select(Department).where(Department.department_id == department_id).with_for_update())
    if dept is None:
        raise NotFoundError("Không tìm thấy khoa phòng")
    changes = data.model_dump(exclude_unset=True)
    if changes.get("name", "") is None or changes.get("is_active", True) is None:
        raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ")
    if changes.get("is_active", True) is False and db.scalar(
            select(DoctorDuty.duty_id).where(DoctorDuty.department_id == department_id,
                                             DoctorDuty.ended_at.is_(None), DoctorDuty.duty_date == func.current_date())):
        raise AppError(409, "DEPARTMENT_ON_DUTY", "Khoa đang có bác sĩ trực, kết thúc ca trước khi ngừng sử dụng")
    if changes.get("is_active", dept.is_active) or "room" in changes:
        _room_taken(db, changes.get("room", dept.room), exclude=dept.department_id)
    old = audit.snapshot(dept, changes.keys())
    for k, v in changes.items():
        setattr(dept, k, v)
    old_diff, new_diff = audit.diff_values(old, {k: getattr(dept, k) for k in changes})
    if new_diff:
        dept.updated_at = func.now()
        audit.record(db, action="UPDATE", entity="department", entity_id=dept.department_id,
                     actor_id=actor.user_id, old_values=old_diff, new_values=new_diff)
    db.flush()
    db.refresh(dept)
    return _out(dept, _doctors_by_department(db))


# ---------------------------------------------------------------------------- ca trực
def _close_stale(db: Session) -> None:
    db.execute(update(DoctorDuty)
               .where(DoctorDuty.ended_at.is_(None), DoctorDuty.duty_date < func.current_date())
               .values(ended_at=func.greatest(DoctorDuty.started_at, func.now()), break_since=None))


def _open_duty(db: Session, physician_id: uuid.UUID, *, for_update: bool = False) -> DoctorDuty | None:
    stmt = select(DoctorDuty).where(DoctorDuty.physician_id == physician_id, DoctorDuty.ended_at.is_(None),
                                    DoctorDuty.duty_date == func.current_date())
    return db.scalar(stmt.with_for_update() if for_update else stmt)


def list_duty(db: Session) -> list[dict]:
    rows = db.execute(
        select(DoctorDuty, User.full_name, Department.code, Department.name, Department.room)
        .join(User, User.user_id == DoctorDuty.physician_id)
        .join(Department, Department.department_id == DoctorDuty.department_id)
        .where(DoctorDuty.ended_at.is_(None), DoctorDuty.duty_date == func.current_date())
        .order_by(Department.code)).all()
    busy = dict(db.execute(select(Visit.physician_id, Visit.visit_id)
                           .where(Visit.status == "Examining", Visit.physician_id.is_not(None))
                           .order_by(Visit.exam_started_at)).all())
    out = []
    for duty, name, code, dept_name, room in rows:
        visit_id = busy.get(duty.physician_id)
        status = "break" if duty.break_since else ("examining" if visit_id else "on")
        out.append({"duty_id": duty.duty_id, "physician_id": duty.physician_id, "physician_name": name,
                    "department_id": duty.department_id, "department_code": code, "department_name": dept_name,
                    "room": room, "duty_date": duty.duty_date, "started_at": duty.started_at,
                    "break_since": duty.break_since, "status": status, "examining_visit_id": visit_id})
    return out


def _one(db: Session, physician_id: uuid.UUID) -> dict:
    return next(d for d in list_duty(db) if d["physician_id"] == physician_id)


def start_duty(db: Session, department_id: uuid.UUID | None, actor: User) -> dict:
    _close_stale(db)
    target = department_id or actor.department_id
    if target is None:
        raise AppError(422, "DEPARTMENT_REQUIRED", "Chọn khoa/phòng để bắt đầu ca trực",
                       [{"field": "department_id", "in": "body", "message": "Bắt buộc"}])
    dept = require_active(db, target)
    current = _open_duty(db, actor.user_id, for_update=True)
    if current and current.department_id == dept.department_id:
        return _one(db, actor.user_id)
    taken = db.execute(select(User.full_name).join(DoctorDuty, DoctorDuty.physician_id == User.user_id)
                       .where(DoctorDuty.department_id == dept.department_id, DoctorDuty.ended_at.is_(None),
                              DoctorDuty.physician_id != actor.user_id)).scalar()
    if taken:
        raise AppError(409, "ROOM_TAKEN", f"Phòng này đang có bác sĩ {taken} trực",
                       [{"field": "department_id", "in": "body", "by": taken}])
    if current:
        current.ended_at, current.break_since = func.now(), None
        db.flush()
    duty = DoctorDuty(physician_id=actor.user_id, department_id=dept.department_id)
    db.add(duty)
    db.flush()
    audit.record(db, action="CREATE", entity="doctor_duty", entity_id=duty.duty_id, actor_id=actor.user_id,
                 new_values={"department_code": dept.code, "room": dept.room})
    return _one(db, actor.user_id)


def set_break(db: Session, on: bool, actor: User) -> dict:
    duty = _open_duty(db, actor.user_id, for_update=True)
    if duty is None:
        raise AppError(409, "NOT_ON_DUTY", "Bạn chưa bắt đầu ca trực")
    if bool(duty.break_since) != on:
        duty.break_since = func.now() if on else None
        audit.record(db, action="UPDATE", entity="doctor_duty", entity_id=duty.duty_id, actor_id=actor.user_id,
                     new_values={"break": on})
        db.flush()
    return _one(db, actor.user_id)


def end_duty(db: Session, actor: User) -> None:
    duty = _open_duty(db, actor.user_id, for_update=True)
    if duty is None:
        raise AppError(409, "NOT_ON_DUTY", "Bạn chưa bắt đầu ca trực")
    duty.ended_at, duty.break_since = func.now(), None
    audit.record(db, action="UPDATE", entity="doctor_duty", entity_id=duty.duty_id, actor_id=actor.user_id,
                 new_values={"ended": True})


def current_department(db: Session, physician_id: uuid.UUID) -> uuid.UUID | None:
    duty = _open_duty(db, physician_id)
    return duty.department_id if duty else None
