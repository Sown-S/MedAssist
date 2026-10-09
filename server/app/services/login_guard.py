"""Giới hạn đăng nhập sai, tính từ các dòng LOGIN_FAILED trong audit_log (không cần bảng mới).

Quy tắc (cấu hình trong .env):
  * Theo tên đăng nhập: LOGIN_MAX_FAILURES_PER_USER lần sai trong LOGIN_WINDOW_MINUTES phút
    (chỉ đếm sau lần đăng nhập thành công gần nhất) -> khóa LOGIN_LOCK_MINUTES phút kể từ lần sai cuối.
  * Theo IP: LOGIN_MAX_FAILURES_PER_IP lần (chặn dò nhiều tên khác nhau từ một máy).
  * Lượt bị chặn vẫn ghi LOGIN_FAILED (reason "locked") nhưng KHÔNG được đếm, để thời gian
    khóa không bị kéo dài mãi.
"""
import math
from datetime import datetime, timedelta

from sqlalchemy import func, select
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


def check_login_allowed(db: Session, username: str, ip: str | None) -> int:
    """Trả 0 nếu được thử đăng nhập; ngược lại số giây phải chờ."""
    now = db.scalar(select(func.clock_timestamp()))
    window_start = now - timedelta(minutes=settings.LOGIN_WINDOW_MINUTES)
    lock = timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
    waits: list[timedelta] = []

    since = window_start
    user_id = db.scalar(select(User.user_id).where(User.username == username))
    if user_id is not None:
        last_success = db.scalar(select(func.max(AuditLog.created_at)).where(
            AuditLog.action_type == "LOGIN", AuditLog.user_id == user_id))
        if last_success and last_success > since:
            since = last_success
    count, last = _failures(db, since, AuditLog.attempted_username == username)
    if count >= settings.LOGIN_MAX_FAILURES_PER_USER and last is not None:
        waits.append(lock - (now - last))

    if ip:
        count, last = _failures(db, window_start, AuditLog.ip_address == ip)
        if count >= settings.LOGIN_MAX_FAILURES_PER_IP and last is not None:
            waits.append(lock - (now - last))

    wait = max(waits, default=timedelta(0)).total_seconds()
    return max(0, math.ceil(wait))
