"""Quản lý tài khoản (US07): chỉ Admin. Không xóa tài khoản (được tham chiếu khắp nơi) — khóa thay thế."""
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.exceptions import AppError, NotFoundError
from app.models import AuditLog, Department
from app.models.user import SYSTEM_USER_ID, User
from app.schemas.user import UserCreate, UserUpdate
from app.services import audit_service as audit
from app.services import login_guard
from app.services.department_service import require_active

_PUBLIC_FIELDS = ["full_name", "role", "is_active", "email", "phone", "staff_code", "license_no", "department_id"]
_COLUMNS = ("user_id", "username", "full_name", "role", "email", "phone", "is_active", "must_change_password",
            "staff_code", "license_no", "department_id", "created_at")


def to_out(db: Session, users: list[User]) -> list[dict]:
    """Thêm các trường tính từ audit_log và tên khoa (ERD v1.9 mục 2.1: không lưu thành cột)."""
    ids = [u.user_id for u in users]
    if not ids:
        return []
    last_login = dict(db.execute(select(AuditLog.user_id, func.max(AuditLog.created_at))
                                 .where(AuditLog.action_type == "LOGIN", AuditLog.user_id.in_(ids))
                                 .group_by(AuditLog.user_id)).all())
    creator = User.__table__.alias("creator")
    created_by = dict(db.execute(select(AuditLog.entity_id, creator.c.full_name)
                                 .join(creator, creator.c.user_id == AuditLog.user_id)
                                 .where(AuditLog.action_type == "CREATE", AuditLog.target_entity == "users",
                                        AuditLog.entity_id.in_(ids))).all())
    dept_ids = {u.department_id for u in users if u.department_id}
    dept_names = dict(db.execute(select(Department.department_id, Department.name)
                                 .where(Department.department_id.in_(dept_ids))).all()) if dept_ids else {}
    return [{**{k: getattr(u, k) for k in _COLUMNS},
             "department_name": dept_names.get(u.department_id),
             "created_by": created_by.get(u.user_id),
             "last_login_at": last_login.get(u.user_id),
             "locked_until": login_guard.locked_until(db, u)} for u in users]


def _check_profile(db: Session, data, user_id: uuid.UUID | None = None) -> None:
    fields = data.model_fields_set
    if "staff_code" in fields and data.staff_code:
        stmt = select(User.user_id).where(User.staff_code == data.staff_code)
        if user_id:
            stmt = stmt.where(User.user_id != user_id)
        if db.scalar(stmt):
            raise AppError(409, "STAFF_CODE_TAKEN", f"Mã nhân viên '{data.staff_code}' đã được dùng",
                           [{"field": "staff_code", "in": "body", "message": "Đã tồn tại"}])
    if "department_id" in fields and data.department_id:
        require_active(db, data.department_id)


def _get_editable(db: Session, user_id: uuid.UUID, *, for_update: bool = False) -> User:
    if user_id == SYSTEM_USER_ID:
        raise AppError(403, "SYSTEM_ACCOUNT", "Không được thay đổi tài khoản hệ thống")
    stmt = select(User).where(User.user_id == user_id)
    if for_update:
        stmt = stmt.with_for_update()
    user = db.scalar(stmt)
    if user is None:
        raise NotFoundError("Không tìm thấy tài khoản")
    return user


def list_users(db: Session, *, role: str | None, is_active: bool | None, q: str | None,
               limit: int, offset: int) -> tuple[int, list[User]]:
    stmt = select(User).where(User.user_id != SYSTEM_USER_ID)
    if role:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(User.username).like(like),
                              func.lower(func.f_unaccent(User.full_name)).like(func.lower(func.f_unaccent(like)))))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(User.role, User.username).limit(limit).offset(offset)).all()
    return total or 0, list(rows)


def get_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None or user.user_id == SYSTEM_USER_ID:
        raise NotFoundError("Không tìm thấy tài khoản")
    return user


def create_user(db: Session, data: UserCreate, actor: User) -> User:
    if db.scalar(select(User.user_id).where(User.username == data.username)):
        raise AppError(409, "USERNAME_TAKEN", f"Tên đăng nhập '{data.username}' đã tồn tại",
                       [{"field": "username", "in": "body", "message": "Đã tồn tại"}])
    _check_profile(db, data)
    user = User(username=data.username, full_name=data.full_name, role=data.role,
                password_hash=hash_password(data.password), email=data.email, phone=data.phone,
                staff_code=data.staff_code, license_no=data.license_no, department_id=data.department_id,
                must_change_password=True)
    db.add(user)
    db.flush()
    audit.record(db, action="CREATE", entity="users", entity_id=user.user_id, actor_id=actor.user_id,
                 new_values={"username": user.username, **{f: getattr(user, f) for f in _PUBLIC_FIELDS},
                             "password_set": True})
    return user


def _active_admins(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(User).where(
        User.role == "Admin", User.is_active.is_(True), User.user_id != SYSTEM_USER_ID)) or 0


def update_user(db: Session, user_id: uuid.UUID, data: UserUpdate, actor: User) -> User:
    user = _get_editable(db, user_id, for_update=True)
    changes = data.model_dump(exclude_unset=True)
    _check_profile(db, data, user_id)

    loses_admin = user.role == "Admin" and user.is_active and (
        changes.get("role", "Admin") != "Admin" or changes.get("is_active", True) is False)
    if loses_admin:
        if user.user_id == actor.user_id:
            raise AppError(422, "SELF_LOCKOUT", "Không thể tự khóa hoặc tự hạ vai trò Admin của chính mình")
        # Khóa hàng Admin để hai yêu cầu đồng thời không cùng hạ hai Admin cuối
        db.execute(select(User.user_id).where(User.role == "Admin").with_for_update())
        if _active_admins(db) <= 1:
            raise AppError(422, "LAST_ADMIN", "Phải còn ít nhất một Admin đang hoạt động")

    old = audit.snapshot(user, changes.keys())
    for field, value in changes.items():
        setattr(user, field, value)
    old_diff, new_diff = audit.diff_values(old, {k: getattr(user, k) for k in changes})
    if new_diff:
        audit.record(db, action="UPDATE", entity="users", entity_id=user.user_id,
                     actor_id=actor.user_id, old_values=old_diff, new_values=new_diff)
    return user


def reset_password(db: Session, user_id: uuid.UUID, new_password: str, actor: User) -> None:
    user = _get_editable(db, user_id, for_update=True)
    user.password_hash = hash_password(new_password)
    user.must_change_password = True
    audit.record(db, action="UPDATE", entity="users", entity_id=user.user_id, actor_id=actor.user_id,
                 new_values={"password_reset_by_admin": True})


def unlock_user(db: Session, user_id: uuid.UUID, actor: User) -> User:
    """Mở khóa do sai mật khẩu: các lần sai trước mốc này không còn được đếm (login_guard)."""
    user = _get_editable(db, user_id, for_update=True)
    audit.record(db, action="UPDATE", entity="users", entity_id=user.user_id, actor_id=actor.user_id,
                 new_values={"unlocked": True})
    return user
