"""Định dạng lỗi thống nhất, X-Request-ID, CORS, cấu hình prod (lượt 4b)."""
import uuid

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, ValidationError

from app.core.config import Settings
from app.exceptions import AppError, NotFoundError
from app.main import app


# ---- route giả để sinh từng loại lỗi --------------------------------------------------
class _Vitals(BaseModel):
    spo2_pct: float = Field(ge=50, le=100)


class _Body(BaseModel):
    full_name: str = Field(min_length=1, max_length=10)
    gender: str = Field(pattern="^(Male|Female|Other)$")
    vital_signs: _Vitals


_err_router = APIRouter(prefix="/_test/errors")


@_err_router.post("/validate")
def _validate(body: _Body):
    return {"ok": True}


@_err_router.get("/not-found")
def _not_found():
    raise NotFoundError("Không tìm thấy bệnh nhân")


@_err_router.get("/app-error")
def _app_error():
    raise AppError(409, "QUEUE_TAKEN", "Lượt khám đã có bác sĩ nhận", [{"field": "visit_id"}])


@_err_router.get("/boom")
def _boom():
    raise RuntimeError("SELECT * FROM patient WHERE secret = 'lo'")   # không được lộ ra client


@_err_router.post("/fk")
def _fk():
    from app.core.database import SessionLocal
    from app.models import Visit
    with SessionLocal() as db:
        db.add(Visit(patient_id=uuid.uuid4(), nurse_id=uuid.uuid4(), chief_complaint="x"))
        db.commit()


app.include_router(_err_router, prefix="/api/v1")


def test_validation_error_vietnamese_with_field_paths(client):
    r = client.post("/api/v1/_test/errors/validate",
                    json={"full_name": "", "gender": "Nam", "vital_signs": {"spo2_pct": 120}})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_ERROR" and err["message"] == "Dữ liệu không hợp lệ"
    by_field = {d["field"]: d for d in err["details"]}
    assert by_field["full_name"]["message"] == "Không được để trống"
    assert by_field["gender"]["message"] == "Sai định dạng"
    assert by_field["vital_signs.spo2_pct"] == {"field": "vital_signs.spo2_pct", "in": "body",
                                                 "message": "Phải nhỏ hơn hoặc bằng 100"}
    assert err["request_id"] == r.headers["x-request-id"]


def test_missing_body_and_bad_json(client):
    r = client.post("/api/v1/_test/errors/validate", json={})
    assert {d["message"] for d in r.json()["error"]["details"]} == {"Thiếu trường bắt buộc"}
    r = client.post("/api/v1/_test/errors/validate", content=b"{khong-phai-json",
                    headers={"Content-Type": "application/json"})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["message"] == "JSON không hợp lệ"


def test_query_param_errors_in_query(client, login):
    r = client.get("/api/v1/admin/audit-logs", params={"limit": 0, "user_id": "x"}, headers=login("admin"))
    details = r.json()["error"]["details"]
    assert {(d["in"], d["field"]) for d in details} == {("query", "limit"), ("query", "user_id")}
    assert any(d["message"] == "Không phải mã UUID hợp lệ" for d in details)


def test_app_errors(client):
    r = client.get("/api/v1/_test/errors/not-found")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
    assert r.json()["error"]["message"] == "Không tìm thấy bệnh nhân"
    r = client.get("/api/v1/_test/errors/app-error")
    assert r.status_code == 409 and r.json()["error"]["code"] == "QUEUE_TAKEN"
    assert r.json()["error"]["details"] == [{"field": "visit_id"}]


def test_http_errors_from_framework(client, login):
    r = client.get("/api/v1/khong-co")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
    r = client.delete("/api/v1/auth/me")
    assert r.status_code == 405 and r.json()["error"]["code"] == "METHOD_NOT_ALLOWED"
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "UNAUTHORIZED"
    assert r.headers["www-authenticate"] == "Bearer"           # header của 401 vẫn giữ
    r = client.get("/api/v1/admin/audit-logs", headers=login("bs"))
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"


def test_integrity_error_mapped_without_leaking_sql(client):
    r = client.post("/api/v1/_test/errors/fk")
    assert r.status_code == 409
    err = r.json()["error"]
    assert err["code"] == "INVALID_REFERENCE"
    assert err["details"] == [{"constraint": "visit_nurse_id_fkey"}] or \
           err["details"] == [{"constraint": "visit_patient_id_fkey"}]
    assert "INSERT" not in r.text and "psycopg" not in r.text


def test_unhandled_error_is_500_without_details(users):
    c = TestClient(app, raise_server_exceptions=False)
    r = c.get("/api/v1/_test/errors/boom")
    assert r.status_code == 500
    err = r.json()["error"]
    assert err["code"] == "INTERNAL_ERROR" and "request_id" in err
    assert "SELECT" not in r.text and "secret" not in r.text


def test_request_id_generated_or_reused(client):
    r = client.get("/health")
    rid = r.headers["x-request-id"]
    assert len(rid) == 32
    assert client.get("/health", headers={"X-Request-ID": "client-abc-12345"}).headers["x-request-id"] == "client-abc-12345"
    bad = client.get("/health", headers={"X-Request-ID": "x\r\nSet-Cookie: a=b"}).headers["x-request-id"]
    assert bad != "x\r\nSet-Cookie: a=b" and len(bad) == 32    # id lạ bị thay


def test_cors_allows_only_configured_origins(client):
    ok = client.options("/api/v1/auth/login", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization"})
    assert ok.status_code == 200 and ok.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-credentials" not in ok.headers
    evil = client.options("/api/v1/auth/login", headers={
        "Origin": "http://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in evil.headers


def test_prod_settings_guard():
    base = {"DATABASE_URL": "postgresql+psycopg://medassist_app:x@h/medassist",
            "JWT_SECRET_KEY": "k" * 40, "ENVIRONMENT": "prod"}
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        Settings(_env_file=None, **base, CORS_ORIGINS=["*"])
    with pytest.raises(ValidationError, match="DB_ECHO"):
        Settings(_env_file=None, **base, DB_ECHO=True)
    assert Settings(_env_file=None, **base).is_prod
