"""Lược đồ Alembic 0011 (ERD §6): ràng buộc, chỉ mục duy nhất, khóa ngoại, trigger phiếu hoàn tiền,
ca làm việc và phân quyền bảng chỉ thêm, kiểm trực tiếp trên CSDL bằng vai trò medassist_app."""

import threading
import time
import uuid
from datetime import date

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.database import SessionLocal, engine
from app.exceptions import AppError
from app.services import settings_service
from app.validation.settings_validators import validate_setting

OLD_DAY = date(2020, 1, 2)


def _fails(sql: str, params: dict | None = None, *, state: str, name: str | None = None, conn_engine=engine) -> None:
    """Câu lệnh bị CSDL chặn với đúng SQLSTATE (và tên ràng buộc nếu có); transaction bị rollback."""
    with conn_engine.connect() as conn, pytest.raises(DBAPIError) as exc:
        conn.execute(text(sql), params or {})
        conn.commit()
    assert exc.value.orig.sqlstate == state, exc.value
    if name:
        assert name in str(exc.value)


def _ok(sql: str, params: dict | None = None):
    with engine.begin() as conn:
        return conn.execute(text(sql), params or {})


def _user(role: str = "Physician", room_id=None) -> uuid.UUID:
    with engine.begin() as conn:
        return conn.scalar(
            text(
                "INSERT INTO users(username, password_hash, full_name, role, room_id) "
                "VALUES (:u, 'x', 'Test 0011', :r, :room) RETURNING user_id"
            ),
            {"u": f"t11_{uuid.uuid4().hex[:10]}", "r": role, "room": room_id},
        )


@pytest.fixture(scope="module")
def rooms(users) -> dict[str, uuid.UUID]:
    with engine.connect() as conn:
        return {code: rid for code, rid in conn.execute(text("SELECT code, room_id FROM room"))}


@pytest.fixture
def visit_id(users) -> uuid.UUID:
    """Lượt khám cũ (2020) để dữ liệu test không lẫn vào hàng đợi, báo cáo hôm nay."""
    with engine.begin() as conn:
        pid = conn.scalar(
            text(
                "INSERT INTO patient(full_name, date_of_birth, gender) VALUES ('BN 0011', '1980-01-01', 'Male') "
                "RETURNING patient_id"
            )
        )
        return conn.scalar(
            text(
                "INSERT INTO visit(patient_id, nurse_id, chief_complaint, visit_date, queue_date) "
                "VALUES (:p, :n, 'Đau gối', :d, :d) RETURNING visit_id"
            ),
            {"p": pid, "n": users["yta"].user_id, "d": OLD_DAY},
        )


# --- users: vai trò Pharmacist, bỏ uq_users_active_room -------------------------------------------
def test_pharmacist_role_accepted_unknown_role_rejected(users):
    assert _user("Pharmacist")
    _fails(
        "INSERT INTO users(username, password_hash, full_name, role) VALUES ('t11_bad_role', 'x', 'x', 'Pharmacy')",
        state="23514",
        name="users_role_check",
    )


def test_many_active_physicians_share_default_room(rooms):
    a, b = _user(room_id=rooms["01"]), _user(room_id=rooms["01"])
    with engine.connect() as conn:
        same = conn.scalar(
            text("SELECT count(*) FROM users WHERE user_id IN (:a, :b) AND room_id = :r"),
            {"a": a, "b": b, "r": rooms["01"]},
        )
        assert same == 2
        assert conn.scalar(text("SELECT count(*) FROM pg_indexes WHERE indexname = 'uq_users_active_room'")) == 0


# --- room_session ---------------------------------------------------------------------------------
_OPEN_SESSION = "INSERT INTO room_session(room_id, physician_id) VALUES (:room, :doc) RETURNING session_id"
_END_SESSION = (
    "UPDATE room_session SET ended_at = now(), ended_reason = 'EndShift', ended_by = physician_id WHERE session_id = :s"
)


def test_room_session_open_then_end_then_reopen(rooms):
    doc = _user()
    sid = _ok(_OPEN_SESSION, {"room": rooms["02"], "doc": doc}).scalar()
    _ok(_END_SESSION, {"s": sid})
    sid2 = _ok(_OPEN_SESSION, {"room": rooms["02"], "doc": doc}).scalar()
    _ok(_END_SESSION, {"s": sid2})


def test_room_session_one_open_per_room_and_per_physician(rooms):
    a, b = _user(), _user()
    sid = _ok(_OPEN_SESSION, {"room": rooms["03"], "doc": a}).scalar()
    try:
        _fails(_OPEN_SESSION, {"room": rooms["03"], "doc": b}, state="23505", name="uq_room_session_open_room")
        _fails(_OPEN_SESSION, {"room": rooms["01"], "doc": a}, state="23505", name="uq_room_session_open_physician")
    finally:
        _ok(_END_SESSION, {"s": sid})


@pytest.mark.parametrize(
    "values",
    [
        "ended_at = now()",
        "ended_at = now(), ended_reason = 'EndShift'",
        "ended_reason = 'EndShift', ended_by = physician_id",
        "ended_at = now(), ended_reason = 'Logout', ended_by = physician_id",
        "ended_at = started_at - interval '1 minute', ended_reason = 'EndShift', ended_by = physician_id",
    ],
)
def test_room_session_end_check(rooms, values):
    sid = _ok(_OPEN_SESSION, {"room": rooms["02"], "doc": _user()}).scalar()
    try:
        _fails(
            f"UPDATE room_session SET {values} WHERE session_id = :s",
            {"s": sid},
            state="23514",
            name="chk_room_session_end",
        )
    finally:
        _ok(_END_SESSION, {"s": sid})


@pytest.mark.parametrize("reason", ["EndShift", "TakenOver", "AccountLocked"])
def test_room_session_end_reasons_accepted(rooms, reason):
    sid = _ok(_OPEN_SESSION, {"room": rooms["02"], "doc": _user()}).scalar()
    _ok(
        "UPDATE room_session SET ended_at = started_at, ended_reason = :r, ended_by = physician_id "
        "WHERE session_id = :s",
        {"s": sid, "r": reason},
    )


def test_room_session_foreign_keys(rooms):
    _fails(_OPEN_SESSION, {"room": uuid.uuid4(), "doc": _user()}, state="23503", name="fk_room_session_room")
    _fails(_OPEN_SESSION, {"room": rooms["02"], "doc": uuid.uuid4()}, state="23503", name="fk_room_session_physician")
    _fails(
        "INSERT INTO room_session(room_id, physician_id, ended_at, ended_reason, ended_by) "
        "VALUES (:room, :doc, now(), 'EndShift', :by)",
        {"room": rooms["02"], "doc": _user(), "by": uuid.uuid4()},
        state="23503",
        name="room_session_ended_by_fkey",
    )


def _wait_until_blocked(timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    with engine.connect() as probe:
        while time.monotonic() < deadline:
            if probe.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0")):
                return True
            probe.rollback()
            time.sleep(0.05)
    return False


def _race(first_sql: str, first_params: dict, second_sql: str, second_params: dict) -> list:
    """Hai transaction chạy đồng thời: transaction 2 phải chờ transaction 1 rồi nhận kết quả của nó."""
    started = threading.Event()
    outcome: list = []

    def second():
        with engine.connect() as conn:
            started.set()
            try:
                conn.execute(text(second_sql), second_params)
                conn.commit()
                outcome.append("committed")
            except DBAPIError as exc:
                outcome.append(exc.orig.sqlstate)

    with engine.connect() as conn:
        conn.execute(text(first_sql), first_params)
        worker = threading.Thread(target=second)
        worker.start()
        started.wait()
        assert _wait_until_blocked(), "transaction 2 phải đang chờ khóa của transaction 1"
        assert outcome == []
        conn.commit()
    worker.join(10)
    return outcome


def test_room_session_concurrent_open_same_room_blocked(rooms):
    a, b = _user(), _user()
    room = rooms["01"]
    assert _race(_OPEN_SESSION, {"room": room, "doc": a}, _OPEN_SESSION, {"room": room, "doc": b}) == ["23505"]
    with engine.begin() as conn:
        assert (
            conn.scalar(text("SELECT count(*) FROM room_session WHERE room_id = :r AND ended_at IS NULL"), {"r": room})
            == 1
        )
        conn.execute(
            text(
                "UPDATE room_session SET ended_at = now(), ended_reason = 'EndShift', ended_by = :a "
                "WHERE room_id = :r AND ended_at IS NULL"
            ),
            {"r": room, "a": a},
        )


def test_room_session_concurrent_open_same_physician_blocked(rooms):
    doc = _user()
    assert _race(
        _OPEN_SESSION, {"room": rooms["01"], "doc": doc}, _OPEN_SESSION, {"room": rooms["02"], "doc": doc}
    ) == ["23505"]
    with engine.begin() as conn:
        assert (
            conn.scalar(
                text("SELECT count(*) FROM room_session WHERE physician_id = :d AND ended_at IS NULL"), {"d": doc}
            )
            == 1
        )
        conn.execute(
            text(
                "UPDATE room_session SET ended_at = now(), ended_reason = 'EndShift', ended_by = :d "
                "WHERE physician_id = :d AND ended_at IS NULL"
            ),
            {"d": doc},
        )


# --- visit: phòng của lượt, hẹn tái khám, VAS -----------------------------------------------------
def test_visit_exam_room_requires_physician(visit_id, rooms):
    _fails(
        "UPDATE visit SET exam_room_id = :r WHERE visit_id = :v",
        {"r": rooms["01"], "v": visit_id},
        state="23514",
        name="chk_visit_exam_room",
    )
    _ok(
        "UPDATE visit SET physician_id = :d, exam_room_id = :r WHERE visit_id = :v",
        {"d": _user(), "r": rooms["01"], "v": visit_id},
    )


def test_visit_room_foreign_keys(visit_id):
    _fails(
        "UPDATE visit SET physician_id = :d, exam_room_id = :r WHERE visit_id = :v",
        {"d": _user(), "r": uuid.uuid4(), "v": visit_id},
        state="23503",
        name="fk_visit_exam_room",
    )
    _fails(
        "UPDATE visit SET target_room_id = :r WHERE visit_id = :v",
        {"r": uuid.uuid4(), "v": visit_id},
        state="23503",
        name="fk_visit_target_room",
    )


def test_visit_target_room_without_physician(visit_id, rooms):
    _ok("UPDATE visit SET target_room_id = :r WHERE visit_id = :v", {"r": rooms["02"], "v": visit_id})


@pytest.mark.parametrize("days", [0, -1])
def test_visit_follow_up_must_be_after_queue_date(visit_id, days):
    _fails(
        "UPDATE visit SET follow_up_date = queue_date + :n WHERE visit_id = :v",
        {"n": days, "v": visit_id},
        state="23514",
        name="chk_visit_follow_up",
    )


def test_visit_follow_up_next_day_and_null_accepted(visit_id):
    _ok("UPDATE visit SET follow_up_date = queue_date + 1 WHERE visit_id = :v", {"v": visit_id})
    _ok("UPDATE visit SET follow_up_date = NULL WHERE visit_id = :v", {"v": visit_id})


def test_visit_vital_signs_accept_pain_vas(visit_id):
    _ok('UPDATE visit SET vital_signs = \'{"pain_vas": 0, "spo2_pct": 97}\' WHERE visit_id = :v', {"v": visit_id})
    _ok("UPDATE visit SET vital_signs = '{\"pain_vas\": 10}' WHERE visit_id = :v", {"v": visit_id})
    _fails(
        'UPDATE visit SET vital_signs = \'{"pain_vas": "7"}\' WHERE visit_id = :v',
        {"v": visit_id},
        state="23514",
        name="chk_visit_vital_signs_keys",
    )
    _fails(
        "UPDATE visit SET vital_signs = '{\"vas\": 7}' WHERE visit_id = :v",
        {"v": visit_id},
        state="23514",
        name="chk_visit_vital_signs_keys",
    )


# --- diagnosis, service_order_item: bên tổn thương, kết quả số ------------------------------------
_DIAG = (
    "INSERT INTO diagnosis(visit_id, physician_id, diagnosis_name, is_primary, laterality) "
    "VALUES (:v, :d, 'Thoái hóa khớp gối', false, :lat)"
)


@pytest.mark.parametrize("lat", [None, "Left", "Right", "Bilateral"])
def test_diagnosis_laterality_accepted(visit_id, lat):
    _ok(_DIAG, {"v": visit_id, "d": _user(), "lat": lat})


@pytest.mark.parametrize("lat", ["left", "Both", ""])
def test_diagnosis_laterality_rejected(visit_id, lat):
    _fails(_DIAG, {"v": visit_id, "d": _user(), "lat": lat}, state="23514", name="chk_diagnosis_laterality")


@pytest.fixture
def order_item(visit_id) -> uuid.UUID:
    with engine.begin() as conn:
        oid = conn.scalar(
            text("INSERT INTO service_order(visit_id, ordered_by) VALUES (:v, :d) RETURNING order_id"),
            {"v": visit_id, "d": _user()},
        )
        return conn.scalar(
            text("INSERT INTO service_order_item(order_id, item_name) VALUES (:o, 'Acid uric') RETURNING item_id"),
            {"o": oid},
        )


_RESULT = "result = 'xx', result_at = now(), result_by = (SELECT user_id FROM users LIMIT 1)"


@pytest.mark.parametrize(
    "values, name",
    [
        ("laterality = 'left'", "chk_service_order_item_laterality"),
        ("numeric_value = 420", "chk_service_order_item_numeric"),
        ("abnormal_flag = 'H'", "chk_service_order_item_numeric"),
        (f"{_RESULT}, abnormal_flag = 'H'", "chk_service_order_item_numeric"),
        (f"{_RESULT}, numeric_value = 420, abnormal_flag = 'X'", "chk_service_order_item_numeric"),
    ],
)
def test_service_order_item_new_checks_reject(order_item, values, name):
    _fails(f"UPDATE service_order_item SET {values} WHERE item_id = :i", {"i": order_item}, state="23514", name=name)


@pytest.mark.parametrize("flag, lat", [("H", "Left"), ("L", "Right"), ("N", "Bilateral"), (None, None)])
def test_service_order_item_numeric_result_accepted(order_item, flag, lat):
    _ok(
        f"UPDATE service_order_item SET {_RESULT}, laterality = :lat, numeric_value = 0, result_unit = 'µmol/L', "
        "ref_low = 200, ref_high = 420, abnormal_flag = :f WHERE item_id = :i",
        {"i": order_item, "f": flag, "lat": lat},
    )


# --- drug.warning_tags ----------------------------------------------------------------------------
_DRUG = (
    "INSERT INTO drug(generic_name, trade_name, strength, dosage_form, unit, sale_price{col}) "
    "VALUES (:g, 'T11', '7,5 mg', 'viên nén', 'viên', 1000{val}) RETURNING warning_tags"
)


def test_drug_warning_tags_default_empty_and_closed_list():
    assert _ok(_DRUG.format(col="", val=""), {"g": f"Meloxicam {uuid.uuid4().hex[:6]}"}).scalar() == []
    tags = ["nsaid", "corticoid", "gi_protect", "weekly_dose", "needs_folate", "pregnancy_contraindicated"]
    assert (
        _ok(_DRUG.format(col=", warning_tags", val=", :t"), {"g": f"X {uuid.uuid4().hex[:6]}", "t": tags}).scalar()
        == tags
    )
    _fails(
        _DRUG.format(col=", warning_tags", val=", :t"),
        {"g": f"Y {uuid.uuid4().hex[:6]}", "t": ["nsaids"]},
        state="23514",
        name="chk_drug_warning_tags",
    )
    _fails(
        _DRUG.format(col=", warning_tags", val=", :t"),
        {"g": f"Z {uuid.uuid4().hex[:6]}", "t": ["nsaid", None]},
        state="23514",
        name="chk_drug_warning_tags",
    )


# --- Tri thức: body_region, trigger_when, v_knowledge_integrity_issues ----------------------------
@pytest.fixture
def kb(users):
    """Transaction chỉ để kiểm: bản phát hành Active + nguồn; rollback khi xong, không đổi tri thức thật."""
    with engine.connect() as conn:
        trans = conn.begin()
        admin, doc = users["admin"].user_id, users["bs"].user_id
        release = conn.scalar(
            text(
                "INSERT INTO knowledge_release(label, status, created_by, approved_by, approved_at) "
                "VALUES (:l, 'Active', :a, :d, now()) RETURNING release_id"
            ),
            {"l": f"KB-T11-{uuid.uuid4().hex[:6]}", "a": admin, "d": doc},
        )
        source = conn.scalar(
            text(
                "INSERT INTO knowledge_source(title, organization, created_by) VALUES ('t', 'BYT', :a) "
                "RETURNING source_id"
            ),
            {"a": admin},
        )
        yield conn, {"release": release, "source": source, "admin": admin}
        trans.rollback()


def _fails_inside(conn, fn, match: str) -> DBAPIError:
    savepoint = conn.begin_nested()
    with pytest.raises(DBAPIError, match=match) as exc:
        fn()
    savepoint.rollback()
    return exc.value


def _symptom(conn, ids, code, *, status="Active", region=None):
    conn.execute(
        text(
            "INSERT INTO symptom(symptom_code, symptom_name, status, release_id, created_by, body_region) "
            "VALUES (:c, :c, :s, :r, :a, :b)"
        ),
        {"c": code, "s": status, "r": ids["release"], "a": ids["admin"], "b": region},
    )


def _rule(conn, ids, key, trigger_when):
    conn.execute(
        text(
            "INSERT INTO triage_rule(rule_key, rule_name, rule_type, condition_logic, trigger_when, "
            "resulting_priority, "
            "reason_text, source_id, status, release_id, created_by) VALUES (:k, 'x', 'RED_FLAG', "
            '\'{"vital": "spo2_pct", "op": "<", "value": 90}\', CAST(:t AS jsonb), '
            "'Emergency', 'x', :s, 'Active', :r, :a)"
        ),
        {"k": key, "t": trigger_when, "s": ids["source"], "r": ids["release"], "a": ids["admin"]},
    )


def _issues(conn, key):
    return conn.execute(
        text("SELECT issue, missing_code FROM v_knowledge_integrity_issues WHERE item_key = :k ORDER BY 1, 2"),
        {"k": key},
    ).all()


def test_symptom_body_region_slug(kb):
    conn, ids = kb
    _symptom(conn, ids, "t11_dau_goi", region="knee")
    _symptom(conn, ids, "t11_dau_lung", region="lumbar_spine")
    _symptom(conn, ids, "t11_toan_than", region=None)
    _fails_inside(conn, lambda: _symptom(conn, ids, "t11_dau_vai", region="Shoulder"), "chk_symptom_body_region")


def test_triage_rule_trigger_when_must_be_object(kb):
    conn, ids = kb
    _rule(conn, ids, "rf_t11_global", None)
    _rule(conn, ids, "rf_t11_gate", '{"body_region": "lumbar_spine"}')
    for bad in ('["x"]', '"lumbar_spine"', "1"):
        _fails_inside(conn, lambda: _rule(conn, ids, "rf_t11_bad", bad), "chk_triage_rule_trigger_when")


def test_integrity_view_checks_trigger_when_codes(kb):
    conn, ids = kb
    _symptom(conn, ids, "t11_active")
    _symptom(conn, ids, "t11_draft", status="Draft")
    tree = '{"any": [{"symptom_code": "t11_active", "state": "PRESENT"}, {"symptom_code": "%s", "state": "PRESENT"}]}'
    _rule(conn, ids, "rf_t11_ok", tree % "t11_active")
    _rule(conn, ids, "rf_t11_draft_code", tree % "t11_draft")
    _rule(conn, ids, "rf_t11_missing_code", tree % "t11_never_existed")
    _rule(conn, ids, "rf_t11_bad_vital", '{"vital": "pain_score", "op": ">", "value": 7}')
    _rule(conn, ids, "rf_t11_vas", '{"vital": "pain_vas", "op": ">=", "value": 7}')
    assert _issues(conn, "rf_t11_ok") == []
    assert _issues(conn, "rf_t11_vas") == []
    assert _issues(conn, "rf_t11_draft_code") == [("SYMPTOM_NOT_ACTIVE", "t11_draft")]
    assert _issues(conn, "rf_t11_missing_code") == [("SYMPTOM_NOT_ACTIVE", "t11_never_existed")]
    assert _issues(conn, "rf_t11_bad_vital") == [("UNKNOWN_VITAL_KEY", "pain_score")]


def test_integrity_trigger_rejects_commit_with_bad_trigger_when(kb):
    conn, ids = kb
    _rule(conn, ids, "rf_t11_commit", '{"symptom_code": "t11_not_active", "state": "PRESENT"}')
    exc = _fails_inside(
        conn, lambda: conn.execute(text("SET CONSTRAINTS trg_triage_rule_integrity IMMEDIATE")), "rf_t11_commit"
    )
    assert exc.orig.sqlstate == "23514" and "t11_not_active" in str(exc)


# --- ai_assessment_log.reasoning_input_hash -------------------------------------------------------
def test_reasoning_hash_column_and_partial_index(users):
    with engine.connect() as conn:
        col = conn.execute(
            text(
                "SELECT data_type, character_maximum_length FROM information_schema.columns "
                "WHERE table_name = 'ai_assessment_log' AND column_name = 'reasoning_input_hash'"
            )
        ).one()
        idx = conn.scalar(text("SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_ai_log_reasoning_hash'"))
    assert tuple(col) == ("character", 64)
    assert "(visit_id, reasoning_input_hash)" in idx
    assert "'Assessment'" in idx and "'Completed'" in idx


# --- Phiếu hoàn tiền ------------------------------------------------------------------------------
@pytest.fixture
def paid_invoice(visit_id, users) -> dict:
    """Hóa đơn Paid: phí khám 1 x 100.000, CLS 2 x 50.000. Trả id hóa đơn và hai dòng."""
    with engine.begin() as conn:
        inv = conn.scalar(
            text(
                "INSERT INTO invoice(visit_id, issued_by, invoice_code, consultation_fee, paraclinical_fee, "
                "total_amount, payment_status, paid_at) VALUES (:v, :n, :c, 100000, 100000, 200000, 'Paid', :d) "
                "RETURNING invoice_id"
            ),
            {"v": visit_id, "n": users["yta"].user_id, "c": f"HD-T11-{uuid.uuid4().hex[:8]}", "d": OLD_DAY},
        )
        item_sql = text(
            "INSERT INTO invoice_item(invoice_id, item_type, item_name, quantity, unit_price, subtotal) "
            "VALUES (:i, :t, :n, :q, :p, :q * :p) RETURNING invoice_item_id"
        )
        cons = conn.scalar(item_sql, {"i": inv, "t": "Consultation", "n": "Phí khám", "q": 1, "p": 100000})
        para = conn.scalar(item_sql, {"i": inv, "t": "Paraclinical", "n": "X-quang gối", "q": 2, "p": 50000})
    return {"invoice": inv, "cons": cons, "para": para, "nurse": users["yta"].user_id}


_NOTE = (
    "INSERT INTO credit_note(invoice_id, credit_code, reason, total_amount, issued_by{col}) "
    "VALUES (:inv, :code, 'Không làm X-quang', :total, :by{val}) RETURNING credit_note_id"
)
_NOTE_ITEM = (
    "INSERT INTO credit_note_item(credit_note_id, invoice_item_id, item_name, quantity, unit_price, subtotal) "
    "VALUES (:cn, :item, 'X-quang gối', :q, :p, :sub)"
)


def _note_sql(paid: dict, item_key: str, qty: int, *, total=None, price=50000) -> tuple[str, dict]:
    """Phiếu và một dòng trong một câu lệnh (CTE) để chạy được trong luồng khác."""
    sql = (
        f"WITH cn AS ({_NOTE.format(col='', val='')}) "
        "INSERT INTO credit_note_item(credit_note_id, invoice_item_id, item_name, quantity, unit_price, subtotal) "
        "SELECT credit_note_id, :item, 'X-quang gối', :q, :p, :q * :p FROM cn"
    )
    return sql, {
        "inv": paid["invoice"],
        "code": f"PH-{uuid.uuid4().hex[:10]}",
        "total": total or qty * price,
        "by": paid["nurse"],
        "item": paid[item_key],
        "q": qty,
        "p": price,
    }


def _credited(item_id) -> int:
    with engine.connect() as conn:
        return conn.scalar(
            text("SELECT COALESCE(SUM(quantity), 0) FROM credit_note_item WHERE invoice_item_id = :i"), {"i": item_id}
        )


def test_credit_note_valid_partial_then_rest(paid_invoice):
    _ok(*_note_sql(paid_invoice, "para", 1))
    _ok(*_note_sql(paid_invoice, "para", 1))
    _ok(*_note_sql(paid_invoice, "cons", 1, price=100000))
    assert _credited(paid_invoice["para"]) == 2 and _credited(paid_invoice["cons"]) == 1


def test_credit_note_cannot_exceed_original_quantity(paid_invoice):
    _fails(*_note_sql(paid_invoice, "para", 3), state="23514", name="vượt số lượng")
    _ok(*_note_sql(paid_invoice, "para", 2))
    _fails(*_note_sql(paid_invoice, "para", 1), state="23514", name="vượt số lượng")
    assert _credited(paid_invoice["para"]) == 2


def test_credit_note_line_of_another_invoice_rejected(paid_invoice, visit_id, users):
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE invoice SET payment_status = 'Cancelled', cancelled_at = now() WHERE invoice_id = :i"),
            {"i": paid_invoice["invoice"]},
        )
    other = dict(paid_invoice)
    with engine.begin() as conn:
        other["invoice"] = conn.scalar(
            text(
                "INSERT INTO invoice(visit_id, issued_by, invoice_code, consultation_fee, total_amount, "
                "payment_status, paid_at) VALUES (:v, :n, :c, 0, 0, 'Paid', now()) RETURNING invoice_id"
            ),
            {"v": visit_id, "n": users["yta"].user_id, "c": f"HD-T11-{uuid.uuid4().hex[:8]}"},
        )
    _fails(*_note_sql(other, "para", 1), state="23514", name="không thuộc hóa đơn")


@pytest.mark.parametrize(
    "values", ["payment_status = 'Pending', paid_at = NULL", "payment_status = 'Cancelled', cancelled_at = now()"]
)
def test_credit_note_requires_paid_invoice(paid_invoice, values):
    _ok(f"UPDATE invoice SET {values} WHERE invoice_id = :i", {"i": paid_invoice["invoice"]})
    _fails(*_note_sql(paid_invoice, "para", 1), state="23514", name="chỉ hoàn tiền hóa đơn đã thanh toán")


def test_credit_note_without_items_rejected_at_commit(paid_invoice):
    _fails(
        _NOTE.format(col="", val=""),
        {
            "inv": paid_invoice["invoice"],
            "code": f"PH-{uuid.uuid4().hex[:8]}",
            "total": 50000,
            "by": paid_invoice["nurse"],
        },
        state="23514",
        name="không có dòng nào",
    )


def test_credit_note_unit_price_must_match_original_line(paid_invoice):
    _fails(*_note_sql(paid_invoice, "para", 1, price=1_000_000), state="23514", name="khác đơn giá đã thu")
    assert _credited(paid_invoice["para"]) == 0


def test_credit_note_cannot_add_line_after_commit(paid_invoice):
    sql, params = _note_sql(paid_invoice, "para", 1)
    _ok(sql, params)
    with engine.connect() as conn:
        cn = conn.scalar(text("SELECT credit_note_id FROM credit_note WHERE credit_code = :c"), {"c": params["code"]})
    _fails(
        _NOTE_ITEM,
        {"cn": cn, "item": paid_invoice["para"], "q": 1, "p": 50000, "sub": 50000},
        state="23514",
        name="lệch tổng dòng",
    )


def test_credit_note_concurrent_invoice_cancel_waits(paid_invoice):
    """Lập phiếu giữ FOR SHARE trên hóa đơn: hủy hóa đơn song song phải chờ phiếu COMMIT."""
    cancel = "UPDATE invoice SET payment_status = 'Cancelled', cancelled_at = now() WHERE invoice_id = :i"
    assert _race(*_note_sql(paid_invoice, "para", 1), cancel, {"i": paid_invoice["invoice"]}) == ["committed"]
    assert _credited(paid_invoice["para"]) == 1


def test_credit_note_total_must_match_items(paid_invoice):
    _fails(*_note_sql(paid_invoice, "para", 1, total=60000), state="23514", name="lệch tổng dòng")


def test_credit_note_two_lines_in_one_note(paid_invoice):
    with engine.begin() as conn:
        cn = conn.scalar(
            text(_NOTE.format(col="", val="")),
            {
                "inv": paid_invoice["invoice"],
                "code": f"PH-{uuid.uuid4().hex[:8]}",
                "total": 200000,
                "by": paid_invoice["nurse"],
            },
        )
        conn.execute(text(_NOTE_ITEM), {"cn": cn, "item": paid_invoice["para"], "q": 2, "p": 50000, "sub": 100000})
        conn.execute(text(_NOTE_ITEM), {"cn": cn, "item": paid_invoice["cons"], "q": 1, "p": 100000, "sub": 100000})


@pytest.mark.parametrize(
    "sql_values, state, name",
    [
        ({"q": 1, "p": 50000, "sub": 40000}, "23514", "chk_credit_note_item_subtotal"),
        ({"q": 0, "p": 50000, "sub": 0}, "23514", "credit_note_item_quantity_check"),
        ({"q": 1, "p": -1, "sub": -1}, "23514", "credit_note_item_unit_price_check"),
    ],
)
def test_credit_note_item_checks(owner_engine, paid_invoice, sql_values, state, name):
    # Trigger guard chặn đơn giá lệch trước CHECK: tắt nó trong transaction (owner, rollback) để kiểm riêng CHECK
    with owner_engine.connect() as conn, pytest.raises(DBAPIError) as exc:
        conn.execute(text("ALTER TABLE credit_note_item DISABLE TRIGGER trg_credit_note_item_guard"))
        cn = conn.scalar(
            text(_NOTE.format(col="", val="")),
            {
                "inv": paid_invoice["invoice"],
                "code": f"PH-{uuid.uuid4().hex[:8]}",
                "total": 50000,
                "by": paid_invoice["nurse"],
            },
        )
        conn.execute(text(_NOTE_ITEM), {"cn": cn, "item": paid_invoice["para"], **sql_values})
    assert exc.value.orig.sqlstate == state and name in str(exc.value)


@pytest.mark.parametrize(
    "col, val, total, name",
    [
        (", refund_method", ", 'Momo'", 50000, "chk_credit_note_refund_method"),
        ("", "", 0, "credit_note_total_amount_check"),
    ],
)
def test_credit_note_header_checks(paid_invoice, col, val, total, name):
    _fails(
        _NOTE.format(col=col, val=val),
        {
            "inv": paid_invoice["invoice"],
            "code": f"PH-{uuid.uuid4().hex[:8]}",
            "total": total,
            "by": paid_invoice["nurse"],
        },
        state="23514",
        name=name,
    )


def test_credit_note_refund_method_banking_transfer(paid_invoice):
    sql, params = _note_sql(paid_invoice, "para", 1)
    _ok(sql.replace("issued_by)", "issued_by, refund_method)").replace(":by)", ":by, 'BankingTransfer')"), params)


def test_credit_note_code_unique(paid_invoice):
    sql, params = _note_sql(paid_invoice, "para", 1)
    _ok(sql, params)
    _fails(sql, params, state="23505", name="uq_credit_note_code")


def test_credit_note_foreign_keys(paid_invoice):
    _fails(
        *_note_sql({**paid_invoice, "para": uuid.uuid4()}, "para", 1),
        state="23503",
        name="fk_credit_note_item_invoice_item",
    )
    header = {"inv": uuid.uuid4(), "code": f"PH-{uuid.uuid4().hex[:8]}", "total": 1, "by": paid_invoice["nurse"]}
    _fails(_NOTE.format(col="", val=""), header, state="23503", name="fk_credit_note_invoice")
    _fails(
        _NOTE_ITEM,
        {"cn": uuid.uuid4(), "item": paid_invoice["para"], "q": 1, "p": 50000, "sub": 50000},
        state="23503",
        name="credit_note_item_credit_note_id_fkey",
    )


def test_credit_note_concurrent_refunds_never_exceed(paid_invoice):
    first = _note_sql(paid_invoice, "para", 2)
    second = _note_sql(paid_invoice, "para", 1)
    assert _race(*first, *second) == ["23514"]
    assert _credited(paid_invoice["para"]) == 2


def test_credit_note_concurrent_partial_refunds_both_fit(paid_invoice):
    assert _race(*_note_sql(paid_invoice, "para", 1), *_note_sql(paid_invoice, "para", 1)) == ["committed"]
    assert _credited(paid_invoice["para"]) == 2


# --- Phân quyền: bảng chỉ thêm, bảng mới ----------------------------------------------------------
def _grants(table: str) -> set[str]:
    """Quyền của medassist_app (vai trò đang kết nối) theo information_schema (ERD §6.2)."""
    with engine.connect() as conn:
        return set(
            conn.scalars(
                text(
                    "SELECT privilege_type FROM information_schema.role_table_grants "
                    "WHERE table_name = :t AND grantee = 'medassist_app'"
                ),
                {"t": table},
            )
        )


def _backup_privileges(table: str) -> set[str]:
    privileges = ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE")
    with engine.connect() as conn:
        return {
            p
            for p in privileges
            if conn.scalar(text(f"SELECT has_table_privilege('medassist_backup', :t, '{p}')"), {"t": table})
        }


@pytest.mark.parametrize("table", ["credit_note", "credit_note_item"])
def test_append_only_grants(users, table):
    assert _grants(table) == {"SELECT", "INSERT"}
    assert _backup_privileges(table) == {"SELECT"}


def test_room_session_grants(users):
    assert _grants("room_session") == {"SELECT", "INSERT", "UPDATE"}
    assert _backup_privileges("room_session") == {"SELECT"}


@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE credit_note SET reason = 'x'",
        "DELETE FROM credit_note",
        "UPDATE credit_note_item SET quantity = 1",
        "DELETE FROM credit_note_item",
        "TRUNCATE credit_note_item",
        "DELETE FROM room_session",
    ],
)
def test_app_cannot_modify_append_only_tables(users, sql):
    _fails(sql, state="42501")


# --- Cấu hình -------------------------------------------------------------------------------------
def test_gi_protect_age_setting_default_and_validation(users):
    with SessionLocal() as db:
        assert settings_service.get_value(db, "prescription.gi_protect_age") == 60
    assert validate_setting("prescription.gi_protect_age", 0) == 0
    for bad in (-1, 121, "60", 60.5, None):
        with pytest.raises(AppError):
            validate_setting("prescription.gi_protect_age", bad)


# --- Catalog khớp ERD §6 --------------------------------------------------------------------------
NEW_NAMED = {
    "chk": [
        "chk_room_session_end",
        "chk_visit_exam_room",
        "chk_visit_follow_up",
        "chk_diagnosis_laterality",
        "chk_service_order_item_laterality",
        "chk_service_order_item_numeric",
        "chk_credit_note_refund_method",
        "chk_credit_note_item_subtotal",
        "chk_drug_warning_tags",
        "chk_symptom_body_region",
        "chk_triage_rule_trigger_when",
    ],
    "uq": ["uq_room_session_open_room", "uq_room_session_open_physician", "uq_credit_note_code"],
    "fk": [
        "fk_room_session_room",
        "fk_room_session_physician",
        "fk_visit_exam_room",
        "fk_visit_target_room",
        "fk_credit_note_invoice",
        "fk_credit_note_item_invoice_item",
    ],
    "trigger": [
        "trg_credit_note_item_guard",
        "trg_credit_note_total_consistency",
        "trg_credit_note_item_total_consistency",
    ],
    "index": [
        "idx_visit_follow_up",
        "idx_ai_log_reasoning_hash",
        "idx_credit_note_invoice",
        "idx_credit_note_item_invoice_item",
    ],
}

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


def test_catalog_counts_match_erd_scale(users):
    """ERD 'Quy mô': 34 bảng, 5 view, 14 + 9 trigger, 67/132 CHECK, 31 duy nhất/114 chỉ mục, 20 khóa ngoại."""
    with engine.connect() as conn:
        counts = conn.execute(text(CATALOG)).mappings().one()
    assert dict(counts) == {
        "tables": 34,
        "views": 5,
        "plain_triggers": 14,
        "constraint_triggers": 9,
        "named_checks": 67,
        "all_checks": 132,
        "named_unique": 31,
        "all_indexes": 114,
        "named_fks": 20,
    }


def test_new_objects_named_as_erd(users):
    with engine.connect() as conn:
        constraints = set(conn.scalars(text("SELECT conname FROM pg_constraint")))
        indexes = set(conn.scalars(text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")))
        triggers = set(conn.scalars(text("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal")))
    assert set(NEW_NAMED["chk"]) <= constraints
    assert set(NEW_NAMED["fk"]) <= constraints
    assert set(NEW_NAMED["uq"]) <= indexes
    assert set(NEW_NAMED["index"]) <= indexes
    assert set(NEW_NAMED["trigger"]) <= triggers
