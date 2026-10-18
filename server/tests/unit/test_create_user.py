"""scripts/create_user.py: tạo tài khoản từ dòng lệnh, các nhánh từ chối, ghi audit bằng 'system'."""
import sys
import uuid

import pytest
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import verify_password
from app.models import AuditLog, User
from app.models.user import SYSTEM_USER_ID
from scripts import create_user


@pytest.fixture
def run(monkeypatch, users):
    """run(argv, passwords) -> mã thoát. passwords: hai lần nhập mật khẩu."""
    def _run(argv: list[str], passwords: tuple[str, str] = ("Matkhau123", "Matkhau123")) -> int:
        answers = iter(passwords)
        monkeypatch.setattr(create_user.getpass, "getpass", lambda _prompt="": next(answers))
        monkeypatch.setattr(sys, "argv", ["create_user", *argv])
        return create_user.main()
    return _run


def _name():
    return f"cli_{uuid.uuid4().hex[:8]}"


def test_creates_user_and_audits_as_system(run, capsys):
    username = _name()
    assert run(["--username", username, "--full-name", "Quản trị viên", "--role", "Admin",
                "--email", "a@b.vn"]) == 0
    assert "Đã tạo Admin" in capsys.readouterr().out
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.username == username))
        assert u.role == "Admin" and u.email == "a@b.vn" and verify_password("Matkhau123", u.password_hash)
        log = db.scalar(select(AuditLog).where(AuditLog.entity_id == u.user_id))
        assert log.action_type == "CREATE" and log.user_id == SYSTEM_USER_ID
        assert log.new_values["source"] == "scripts.create_user" and "password" not in str(log.new_values)


@pytest.mark.parametrize("argv_name, passwords, message", [
    ("system", ("Matkhau123", "Matkhau123"), "tài khoản hệ thống"),
    (None, ("Matkhau123", "Khac12345"), "không khớp"),
    (None, ("ngan", "ngan"), "ít nhất"),
])
def test_rejections(run, capsys, argv_name, passwords, message):
    username = argv_name or _name()
    assert run(["--username", username, "--full-name", "X", "--role", "Nurse"], passwords) == 1
    assert message in capsys.readouterr().err
    if argv_name is None:
        with SessionLocal() as db:
            assert db.scalar(select(User).where(User.username == username)) is None


def test_duplicate_username(run, capsys):
    username = _name()
    assert run(["--username", username, "--full-name", "A", "--role", "Nurse"]) == 0
    assert run(["--username", username, "--full-name", "B", "--role", "Nurse"]) == 1
    assert "đã tồn tại" in capsys.readouterr().err
