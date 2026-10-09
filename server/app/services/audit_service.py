"""Ghi AUDIT_LOG (US09, FR09) — cửa vào duy nhất để thêm dòng nhật ký.

Nguyên tắc:
  * record() chỉ db.add + flush, KHÔNG commit: dòng log nằm cùng transaction với thao tác
    nghiệp vụ, nên cùng thành công hoặc cùng rollback.
  * Ngoại lệ: LOGIN_FAILED — router đăng nhập phải commit dòng log dù đăng nhập thất bại.
  * Chỉ lưu trường thay đổi (diff_values) và luôn che trường nhạy cảm.
  * Không bao giờ UPDATE/DELETE: DB đã chặn bằng trigger + GRANT.
"""
import uuid
from collections.abc import Iterable, Mapping
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.models.audit_log import ACTION_TYPES, AuditLog

MASK = "***"
SENSITIVE_KEYS = frozenset({"password", "password_hash", "new_password", "old_password",
                            "access_token", "refresh_token", "token"})
_MAX_USER_AGENT = 255
_MAX_IP = 45


def _jsonable(value: Any) -> Any:
    """Đổi giá trị Python sang dạng JSON lưu được vào JSONB (UUID, ngày giờ, Decimal, Enum...)."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (uuid.UUID, Decimal)):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Enum):
        return _jsonable(value.value)
    if isinstance(value, Mapping):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_jsonable(v) for v in value]
    return str(value)


def mask_sensitive(values: Mapping[str, Any] | None) -> dict[str, Any] | None:
    if values is None:
        return None
    return {k: (MASK if k in SENSITIVE_KEYS else _jsonable(v)) for k, v in values.items()}


def snapshot(obj: Any, fields: Iterable[str] | None = None) -> dict[str, Any]:
    """Chụp giá trị các cột của một đối tượng ORM (để làm old_values trước khi sửa)."""
    attrs = [a.key for a in inspect(obj).mapper.column_attrs]
    if fields is not None:
        wanted = set(fields)
        attrs = [a for a in attrs if a in wanted]
    return {a: getattr(obj, a) for a in attrs}


def diff_values(old: Mapping[str, Any], new: Mapping[str, Any]) -> tuple[dict, dict]:
    """Chỉ giữ các trường thay đổi. Trả (old_subset, new_subset); cả hai rỗng = không đổi gì."""
    keys = [k for k in new if old.get(k) != new.get(k)]
    return {k: old.get(k) for k in keys}, {k: new.get(k) for k in keys}


def record(
    db: Session,
    *,
    action: str,
    entity: str,
    entity_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    attempted_username: str | None = None,
    old_values: Mapping[str, Any] | None = None,
    new_values: Mapping[str, Any] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    """Thêm một dòng AUDIT_LOG vào session hiện tại (chưa commit)."""
    if action not in ACTION_TYPES:
        raise ValueError(f"action_type không hợp lệ: {action!r}")
    # Kiểm tra sớm, cùng điều kiện với chk_audit_log_actor, để lỗi rõ ràng hơn lỗi DB
    if actor_id is None and not (action == "LOGIN_FAILED" and attempted_username):
        raise ValueError("Thiếu actor_id (chỉ LOGIN_FAILED có attempted_username mới được bỏ trống)")

    entry = AuditLog(
        user_id=actor_id,
        attempted_username=attempted_username[:50] if attempted_username else None,
        action_type=action,
        target_entity=entity,
        entity_id=entity_id,
        old_values=mask_sensitive(old_values),
        new_values=mask_sensitive(new_values),
        ip_address=ip_address[:_MAX_IP] if ip_address else None,
        user_agent=user_agent[:_MAX_USER_AGENT] if user_agent else None,
    )
    db.add(entry)
    db.flush()   # lỗi ràng buộc (nếu có) nổ ra ngay tại đây, không đợi tới commit
    return entry

# ---------------------------------------------------------------------------
# Ghi ngay bằng session riêng — cho VIEW và lượt bị từ chối (request GET không commit,
# request bị 403 không bao giờ tới service).
# ---------------------------------------------------------------------------
def record_now(**kwargs: Any) -> None:
    """Ghi một dòng và commit ngay trong session riêng. Lỗi thì ném ra (fail closed:
    không ghi được nhật ký thì không cho truy cập dữ liệu bệnh nhân)."""
    from app.core.database import SessionLocal   # import muộn: tránh vòng import khi test

    with SessionLocal() as db:
        record(db, **kwargs)
        db.commit()


class _ViewDeduper:
    """Gộp VIEW lặp lại của endpoint polling: một dòng / người / đối tượng / cửa sổ thời gian.

    Lưu trong bộ nhớ của tiến trình (không truy vấn DB). Nhiều tiến trình thì có thể trùng
    một dòng ở mỗi tiến trình — chấp nhận được.
    """

    def __init__(self) -> None:
        import threading
        self._seen: dict[tuple, float] = {}
        self._lock = threading.Lock()

    def should_log(self, key: tuple, window_seconds: int) -> bool:
        import time
        now = time.monotonic()
        with self._lock:
            last = self._seen.get(key)
            if last is not None and now - last < window_seconds:
                return False
            self._seen[key] = now
            if len(self._seen) > 10_000:   # dọn mục cũ, giữ bộ nhớ nhỏ
                cutoff = now - 3600
                self._seen = {k: t for k, t in self._seen.items() if t >= cutoff}
            return True

    def clear(self) -> None:
        with self._lock:
            self._seen.clear()


view_deduper = _ViewDeduper()