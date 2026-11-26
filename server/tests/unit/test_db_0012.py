"""Alembic 0012 gỡ 0011: dừng khi còn dữ liệu chỉ 0011 mới có, không sửa dòng nào;
lược đồ sau gỡ khớp quy mô ERD hiện hành, hạ về 0011 dựng lại đúng lược đồ 0011."""

import uuid
from contextlib import contextmanager
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text

from app.core.database import engine

CFG = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))

_RULE = (
    "WITH rel AS (INSERT INTO knowledge_release(label, status, created_by, approved_by, approved_at) "
    "SELECT :u, 'Active', a.user_id, d.user_id, now() FROM users a, users d "
    "WHERE a.username = 'admin' AND d.username = 'bs' RETURNING release_id, created_by), "
    "src AS (INSERT INTO knowledge_source(title, organization, created_by) SELECT :u, 'BYT', created_by FROM rel "
    "RETURNING source_id) "
    "INSERT INTO triage_rule(rule_key, rule_name, rule_type, condition_logic, trigger_when, resulting_priority, "
    "reason_text, source_id, status, release_id, created_by) "
    "SELECT 'rf_' || :u, 'x', 'RED_FLAG', CAST({logic} AS jsonb), CAST({gate} AS jsonb), 'Emergency', 'x', "
    "src.source_id, 'Active', rel.release_id, rel.created_by FROM rel, src"
)
_RULE_UNDO = [
    "DELETE FROM triage_rule WHERE rule_key = 'rf_' || :u",
    "DELETE FROM knowledge_source WHERE title = :u",
    "DELETE FROM knowledge_release WHERE label = :u",
]
_VISIT = (
    "WITH p AS (INSERT INTO patient(full_name, date_of_birth, gender) VALUES (:u, '1980-01-01', 'Male') "
    "RETURNING patient_id) INSERT INTO visit(patient_id, nurse_id, chief_complaint, visit_date, queue_date, "
    "vital_signs) SELECT patient_id, (SELECT user_id FROM users WHERE username = 'yta'), 'x', "
    "'2020-01-02', '2020-01-02', '{\"pain_vas\": 4}' FROM p"
)

# (dữ liệu vi phạm, vị trí trong thông báo, câu kiểm dữ liệu còn nguyên, câu dọn)
CASES = {
    "pharmacist": (
        "INSERT INTO users(username, password_hash, full_name, role) VALUES (:u, 'x', 'DS', 'Pharmacist')",
        0,
        "SELECT role = 'Pharmacist' FROM users WHERE username = :u",
        ["DELETE FROM users WHERE username = :u"],
    ),
    "shared_room": (
        "INSERT INTO users(username, password_hash, full_name, role, room_id) SELECT :u || n, 'x', 'BS', "
        "'Physician', (SELECT room_id FROM room WHERE code = '03') FROM generate_series(1, 2) n",
        1,
        "SELECT count(*) = 2 FROM users WHERE username LIKE :u || '%' AND room_id IS NOT NULL",
        ["DELETE FROM users WHERE username LIKE :u || '%'"],
    ),
    "pain_vas_visit": (
        _VISIT,
        2,
        "SELECT v.vital_signs ? 'pain_vas' FROM visit v JOIN patient p USING (patient_id) WHERE p.full_name = :u",
        [
            "DELETE FROM visit WHERE patient_id IN (SELECT patient_id FROM patient WHERE full_name = :u)",
            "DELETE FROM patient WHERE full_name = :u",
        ],
    ),
    "pain_vas_rule": (
        _RULE.format(logic='\'{"vital": "pain_vas", "op": ">=", "value": 8}\'', gate="NULL"),
        3,
        "SELECT condition_logic ->> 'vital' = 'pain_vas' FROM triage_rule WHERE rule_key = 'rf_' || :u",
        _RULE_UNDO,
    ),
    "gated_rule": (
        _RULE.format(
            logic='\'{"vital": "spo2_pct", "op": "<", "value": 90}\'',
            gate='\'{"vital": "spo2_pct", "op": "<", "value": 94}\'',
        ),
        4,
        "SELECT trigger_when IS NOT NULL FROM triage_rule WHERE rule_key = 'rf_' || :u",
        _RULE_UNDO,
    ),
}


def _message(position: int) -> str:
    counts = ["0"] * 5
    counts[position] = "1"
    return (
        rf"còn {counts[0]} tài khoản Pharmacist, {counts[1]} phòng có nhiều tài khoản đang hoạt động, "
        rf"{counts[2]} lượt khám có pain_vas, {counts[3]} luật Active dùng pain_vas, "
        rf"{counts[4]} luật Active có trigger_when\."
    )


def _owner(owner_engine, statements, tag: str):
    """Ghi bằng owner: giả lập dữ liệu lúc còn ở 0011 và dọn lại (app không có quyền DELETE)."""
    with owner_engine.begin() as conn:
        result = None
        for sql in [statements] if isinstance(statements, str) else statements:
            result = conn.execute(text(sql), {"u": tag})
        return result


def _version() -> str:
    with engine.connect() as conn:
        return conn.scalar(text("SELECT version_num FROM alembic_version"))


@contextmanager
def _at_0011():
    engine.dispose()
    command.downgrade(CFG, "0011")
    try:
        yield
    finally:
        engine.dispose()
        try:
            command.upgrade(CFG, "head")
        except Exception as exc:  # noqa: BLE001
            pytest.exit(f"DB test kẹt ở 0011, các test sau không còn tin được: {exc}", returncode=1)


@pytest.mark.parametrize("case", list(CASES))
def test_upgrade_stops_on_0011_only_data_and_changes_nothing(owner_engine, users, case):
    setup, position, still, undo = CASES[case]
    tag = f"t12_{uuid.uuid4().hex[:6]}"
    with _at_0011():
        try:
            _owner(owner_engine, setup, tag)
            with pytest.raises(Exception, match=_message(position)):
                command.upgrade(CFG, "head")
            assert _version() == "0011"
            assert _owner(owner_engine, still, tag).scalar() is True
        finally:
            _owner(owner_engine, undo, tag)
    assert _version() == "0012"


def test_inactive_account_sharing_room_does_not_stop_upgrade(owner_engine, users):
    tag = f"t12_{uuid.uuid4().hex[:6]}"
    try:
        with _at_0011():
            _owner(
                owner_engine,
                "INSERT INTO users(username, password_hash, full_name, role, room_id, is_active) "
                "SELECT :u || n, 'x', 'BS', 'Physician', (SELECT room_id FROM room WHERE code = '03'), n = 1 "
                "FROM generate_series(1, 2) n",
                tag,
            )
        assert _version() == "0012"
        rooms = _owner(owner_engine, "SELECT count(room_id) FROM users WHERE username LIKE :u || '%'", tag).scalar()
        assert rooms == 2
    finally:
        _owner(owner_engine, "DELETE FROM users WHERE username LIKE :u || '%'", tag)


def test_upgrade_removes_gi_protect_age_setting(owner_engine, users):
    with _at_0011():
        _owner(
            owner_engine,
            "INSERT INTO system_setting(setting_key, value, updated_by) "
            "SELECT 'prescription.gi_protect_age', '65', user_id FROM users WHERE username = :u",
            "admin",
        )
    sql = "SELECT count(*) FROM system_setting WHERE setting_key = 'prescription.gi_protect_age'"
    assert _owner(owner_engine, sql, "").scalar() == 0


CATALOG = """
SELECT
 (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version') AS tables,
 (SELECT count(*) FROM pg_views WHERE schemaname = 'public') AS views,
 (SELECT count(*) FILTER (WHERE tgconstraint = 0) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT tgisinternal) AS plain_triggers,
 (SELECT count(*) FILTER (WHERE tgconstraint <> 0) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT tgisinternal)
   AS constraint_triggers,
 (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
   WHERE n.nspname = 'public' AND contype = 'c' AND conname LIKE 'chk\\_%') AS named_checks,
 (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
   WHERE n.nspname = 'public' AND contype = 'c') AS all_checks,
 (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND i.indisunique AND NOT i.indisprimary AND c.relname LIKE 'uq\\_%') AS named_unique,
 (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public') AS all_indexes,
 (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
   WHERE n.nspname = 'public' AND contype = 'f' AND conname LIKE 'fk\\_%') AS named_fks
"""
_KEYS = (
    "tables", "views", "plain_triggers", "constraint_triggers", "named_checks", "all_checks", "named_unique",
    "all_indexes", "named_fks",
)  # fmt: skip
SCALE_0010 = dict(zip(_KEYS, (31, 5, 13, 7, 56, 118, 29, 105, 14), strict=True))  # ERD "Quy mô"
SCALE_0011 = dict(zip(_KEYS, (34, 5, 14, 9, 67, 132, 31, 114, 20), strict=True))


def _catalog() -> dict:
    with engine.connect() as conn:
        return dict(conn.execute(text(CATALOG)).mappings().one())


def test_catalog_matches_erd_scale_and_downgrade_rebuilds_0011(users):
    assert _catalog() == SCALE_0010
    with _at_0011():
        assert _catalog() == SCALE_0011
    assert _catalog() == SCALE_0010
