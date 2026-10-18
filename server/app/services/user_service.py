"""Quản lý tài khoản (US07): chỉ Admin. Không xóa tài khoản (được tham chiếu khắp nơi) — khóa thay thế."""
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.exceptions import AppError, NotFoundError
from app.models.user import SYSTEM_USER_ID, User
from app.schemas.user import UserCreate, UserUpdate
from app.services import audit_service as audit

_PUBLIC_FIELDS = ["full_name", "role", "is_active", "email", "phone"]


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
    user = User(username=data.username, full_name=data.full_name, role=data.role,
                password_hash=hash_password(data.password), email=data.email, phone=data.phone)
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
    audit.record(db, action="UPDATE", entity="users", entity_id=user.user_id, actor_id=actor.user_id,
                 new_values={"password_reset_by_admin": True})
