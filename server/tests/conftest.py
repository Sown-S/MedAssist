"""Hạ tầng pytest — chạy trên database RIÊNG `medassist_test`, dựng lại mỗi lần chạy.

* URL test lấy từ DATABASE_URL / MIGRATION_DATABASE_URL trong server/.env, chỉ đổi tên
  database thành medassist_test (cùng vai trò, cùng mật khẩu). Có thể ghi đè bằng
  TEST_DATABASE_URL / TEST_MIGRATION_DATABASE_URL.
* Phải đặt biến môi trường TRƯỚC khi import app (settings và engine tạo lúc import).
* Từ chối chạy nếu database không phải medassist_test: downgrade base xóa sạch dữ liệu.
"""
import os
import uuid
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy.engine import make_url

SERVER_DIR = Path(__file__).resolve().parents[1]
TEST_DB = "medassist_test"

_env = {**dotenv_values(SERVER_DIR / ".env", encoding="utf-8-sig"), **os.environ}


def _test_url(explicit_key: str, base_key: str) -> str:
    raw = _env.get(explicit_key)
    if not raw:
        base = _env.get(base_key)
        if not base:
            raise RuntimeError(f"Thiếu {base_key} trong server/.env")
        raw = make_url(base).set(database=TEST_DB).render_as_string(hide_password=False)
    if make_url(raw).database != TEST_DB:
        raise RuntimeError(f"{explicit_key} phải trỏ tới database '{TEST_DB}' (đang là "
                           f"'{make_url(raw).database}'). Test xóa sạch DB, không chạy trên DB dev.")
    return raw


os.environ["DATABASE_URL"] = _test_url("TEST_DATABASE_URL", "DATABASE_URL")
os.environ["MIGRATION_DATABASE_URL"] = _test_url("TEST_MIGRATION_DATABASE_URL", "MIGRATION_DATABASE_URL")
os.environ["MEDASSIST_ALLOW_DROP_SCHEMA"] = "1"
os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret-key-at-least-32-characters!!")

# ---- từ đây mới được import app ----------------------------------------------------
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi import APIRouter, Depends  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, select, text  # noqa: E402

from app.core.audit_view import CLINICAL_ROLES, audit_view  # noqa: E402
from app.core.auth import require_roles  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import AuditLog, User  # noqa: E402
from app.services import audit_service as audit  # noqa: E402

PASSWORD = "Matkhau123"


# ---- Route giả: thay cho router Patient / Visit / Drug chưa viết (bước 4) -----------
_test_router = APIRouter(prefix="/_test", tags=["_test"])


@_test_router.get("/patients/{patient_id}")
def _fake_get_patient(patient_id: uuid.UUID,
                      _: User = Depends(audit_view("patient", roles=CLINICAL_ROLES,
                                                   id_param="patient_id"))):
    return {"patient_id": str(patient_id)}


@_test_router.get("/patients")
def _fake_search_patients(_: User = Depends(audit_view("patient", roles=CLINICAL_ROLES))):
    return []


@_test_router.get("/queue")
def _fake_queue(_: User = Depends(audit_view("visit", roles=CLINICAL_ROLES, dedupe_seconds=300))):
    return []


@_test_router.get("/visits/{visit_id}/ai-status")
def _fake_ai_status(visit_id: uuid.UUID,
                    _: User = Depends(audit_view("visit", roles=CLINICAL_ROLES,
                                                 id_param="visit_id", dedupe_seconds=300))):
    return {"status": "Queued"}


@_test_router.post("/drugs")
def _fake_create_drug(_: User = Depends(require_roles("Admin", audit_entity="drug"))):
    return {"ok": True}


app.include_router(_test_router, prefix="/api/v1")


# ---- Fixture -----------------------------------------------------------------------
@pytest.fixture(scope="session", autouse=True)
def _fresh_schema():
    """Dựng lại lược đồ bằng chính Alembic: kiểm tra luôn 0001/0002 chạy được từ đầu."""
    assert make_url(settings.DATABASE_URL).database == TEST_DB
    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    engine.dispose()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield
    engine.dispose()


@pytest.fixture(scope="session")
def users(_fresh_schema) -> dict[str, User]:
    """Một tài khoản mỗi vai trò + một tài khoản bị khóa. Mật khẩu chung: PASSWORD."""
    specs = {"admin": "Admin", "bs": "Physician", "yta": "Nurse", "khoa": "Nurse"}
    out = {}
    with SessionLocal() as db:
        for username, role in specs.items():
            u = User(username=username, password_hash=hash_password(PASSWORD),
                     full_name=f"Test {username}", role=role, is_active=(username != "khoa"))
            db.add(u)
            out[username] = u
        db.commit()
    return out


@pytest.fixture
def client(users) -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset_deduper():
    audit.view_deduper.clear()
    yield


@pytest.fixture
def login(client):
    def _login(username: str, password: str = PASSWORD) -> dict[str, str]:
        r = client.post("/api/v1/auth/login", json={"username": username, "password": password})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}
    return _login


@pytest.fixture
def since():
    """Mốc thời gian của DB lúc test bắt đầu: chỉ xét các dòng log do test này tạo."""
    with engine.connect() as conn:
        return conn.scalar(text("select clock_timestamp()"))


@pytest.fixture
def logs(since):
    """logs(action=..., entity=...) -> các dòng AUDIT_LOG tạo từ đầu test, cũ trước mới sau."""
    def _logs(**filters) -> list[AuditLog]:
        with SessionLocal() as db:
            stmt = select(AuditLog).where(AuditLog.created_at >= since)
            for key, value in filters.items():
                column = {"action": AuditLog.action_type, "entity": AuditLog.target_entity}.get(key)
                stmt = stmt.where((column if column is not None else getattr(AuditLog, key)) == value)
            return list(db.scalars(stmt.order_by(AuditLog.created_at, AuditLog.log_id)))
    return _logs


@pytest.fixture(scope="session")
def owner_engine(_fresh_schema):
    eng = create_engine(settings.MIGRATION_DATABASE_URL)
    yield eng
    eng.dispose()
