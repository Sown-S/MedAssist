"""Giới hạn đăng nhập sai, tính từ các dòng LOGIN_FAILED trong audit_log (không cần bảng mới).

Quy tắc (cấu hình trong .env):
  * Theo tên đăng nhập: LOGIN_MAX_FAILURES_PER_USER lần sai trong LOGIN_WINDOW_MINUTES phút
    (chỉ đếm sau lần đăng nhập thành công gần nhất) -> khóa LOGIN_LOCK_MINUTES phút kể từ lần sai cuối.
  * Theo IP: LOGIN_MAX_FAILURES_PER_IP lần (chặn dò nhiều tên khác nhau từ một máy).
  * Lượt bị chặn vẫn ghi LOGIN_FAILED (reason "locked") nhưng KHÔNG được đếm, để thời gian
    khóa không bị kéo dài mãi.
  * Admin mở khóa hoặc đặt lại mật khẩu thì chỉ đếm lần sai sau mốc đó (dòng UPDATE users trong audit_log).
"""
import math
from datetime import datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AuditLog, User


def _failures(db: Session, since: datetime, *conditions) -> tuple[int, datetime | None]:
    stmt = select(func.count(), func.max(AuditLog.created_at)).where(
        AuditLog.action_type == "LOGIN_FAILED",
        AuditLog.created_at >= since,
        func.coalesce(AuditLog.new_values["reason"].astext, "") != "locked",
        *conditions,
    )
    count, last = db.execute(stmt).one()
    return count, last


_RELEASE_KEYS = ("unlocked", "password_reset_by_admin")


def _count_since(db: Session, user_id, window_start: datetime) -> datetime:
    """Mốc bắt đầu đếm lần sai của một tài khoản: sau lần đăng nhập thành công hoặc lần Admin mở khóa gần nhất."""
    marks = db.execute(select(
        select(func.max(AuditLog.created_at)).where(AuditLog.action_type == "LOGIN", AuditLog.user_id == user_id)
        .scalar_subquery(),
        select(func.max(AuditLog.created_at)).where(
            AuditLog.action_type == "UPDATE", AuditLog.target_entity == "users", AuditLog.entity_id == user_id,
            or_(*(AuditLog.new_values.has_key(k) for k in _RELEASE_KEYS))).scalar_subquery())).one()
    return max([window_start, *(m for m in marks if m is not None)])


def locked_until(db: Session, user: User) -> datetime | None:
    """Thời điểm tài khoản hết bị khóa vì sai mật khẩu (chỉ tính theo tên đăng nhập), None nếu không bị khóa."""
    now = db.scalar(select(func.clock_timestamp()))
    since = _count_since(db, user.user_id, now - timedelta(minutes=settings.LOGIN_WINDOW_MINUTES))
    count, last = _failures(db, since, AuditLog.attempted_username == user.username)
    if count >= settings.LOGIN_MAX_FAILURES_PER_USER and last is not None:
        until = last + timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
        return until if until > now else None
    return None


def check_login_allowed(db: Session, username: str, ip: str | None) -> int:
    """Trả 0 nếu được thử đăng nhập; ngược lại số giây phải chờ."""
    now = db.scalar(select(func.clock_timestamp()))
    window_start = now - timedelta(minutes=settings.LOGIN_WINDOW_MINUTES)
    lock = timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
    waits: list[timedelta] = []

    user_id = db.scalar(select(User.user_id).where(User.username == username))
    since = _count_since(db, user_id, window_start) if user_id is not None else window_start
    count, last = _failures(db, since, AuditLog.attempted_username == username)
    if count >= settings.LOGIN_MAX_FAILURES_PER_USER and last is not None:
        waits.append(lock - (now - last))

    if ip:
        count, last = _failures(db, window_start, AuditLog.ip_address == ip)
        if count >= settings.LOGIN_MAX_FAILURES_PER_IP and last is not None:
            waits.append(lock - (now - last))

    wait = max(waits, default=timedelta(0)).total_seconds()
    return max(0, math.ceil(wait))
