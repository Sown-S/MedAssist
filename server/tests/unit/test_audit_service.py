"""audit_service: hàm record() và các tiện ích (không qua HTTP)."""
import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.models import AuditLog, User
from app.models.user import SYSTEM_USER_ID
from app.services import audit_service as audit


def test_system_account_created_by_migration_0002(users):
    with SessionLocal() as db:
        system = db.get(User, SYSTEM_USER_ID)
        assert system.username == "system" and system.role == "Admin" and not system.is_active
        created = db.scalar(select(AuditLog).where(AuditLog.entity_id == SYSTEM_USER_ID,
                                                   AuditLog.action_type == "CREATE"))
        assert created is not None and created.user_id == SYSTEM_USER_ID


def test_mask_and_jsonable():
    out = audit.mask_sensitive({"password_hash": "$argon2...", "token": "abc", "id": uuid.UUID(int=1),
                                "dob": date(1990, 1, 2), "at": datetime(2026, 10, 6, 8, 0),
                                "price": Decimal("12.50"), "tags": {"a"}, "n": 3})
    assert out["password_hash"] == "***" and out["token"] == "***"
    assert out["id"] == "00000000-0000-0000-0000-000000000001"
    assert out["dob"] == "1990-01-02" and out["at"] == "2026-10-06T08:00:00"
    assert out["price"] == "12.50" and out["tags"] == ["a"] and out["n"] == 3


def test_diff_values_keeps_only_changed_fields():
    old, new = audit.diff_values({"a": 1, "b": 2, "c": None}, {"a": 1, "b": 3, "c": "x"})
    assert old == {"b": 2, "c": None} and new == {"b": 3, "c": "x"}
    assert audit.diff_values({"a": 1}, {"a": 1}) == ({}, {})


def test_snapshot_reads_orm_columns(users):
    with SessionLocal() as db:
        u = db.get(User, users["bs"].user_id)
        snap = audit.snapshot(u, ["username", "role", "khong_ton_tai"])
    assert snap == {"username": "bs", "role": "Physician"}


def test_record_is_part_of_caller_transaction(users):
    """Rollback nghiệp vụ thì dòng log cũng mất (cùng transaction)."""
    with SessionLocal() as db:
        before = db.scalar(select(func.count()).select_from(AuditLog))
        audit.record(db, action="UPDATE", entity="users", entity_id=users["bs"].user_id,
                     actor_id=users["admin"].user_id, new_values={"x": 1})
        db.rollback()
        assert db.scalar(select(func.count()).select_from(AuditLog)) == before


def test_record_truncates_long_fields(users, logs):
    with SessionLocal() as db:
        audit.record(db, action="LOGIN_FAILED", entity="users", attempted_username="u" * 80,
                     ip_address="1" * 60, user_agent="ua" * 300)
        db.commit()
    row = logs(action="LOGIN_FAILED")[-1]
    assert len(row.attempted_username) == 50 and len(row.ip_address) == 45 and len(row.user_agent) == 255


@pytest.mark.parametrize("kwargs, message", [
    (dict(action="HACK", entity="users", actor_id=SYSTEM_USER_ID), "không hợp lệ"),
    (dict(action="LOGIN", entity="users"), "Thiếu actor_id"),
    (dict(action="LOGIN_FAILED", entity="users"), "Thiếu actor_id"),
])
def test_record_rejects_invalid_calls(kwargs, message):
    with SessionLocal() as db, pytest.raises(ValueError, match=message):
        audit.record(db, **kwargs)


def test_deduper_window():
    d = audit._ViewDeduper()
    assert d.should_log(("u", "visit", "x"), 300) is True
    assert d.should_log(("u", "visit", "x"), 300) is False
    assert d.should_log(("u", "visit", "y"), 300) is True       # đối tượng khác
    assert d.should_log(("u", "visit", "x"), 0) is True         # cửa sổ 0 = luôn ghi
