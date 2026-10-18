"""API quản trị tri thức (US11): vòng đời bản phát hành, soạn nháp, duyệt / từ chối, tắt khẩn cấp."""
import uuid

import pytest
from sqlalchemy import select, text

from app.core.database import SessionLocal, engine
from app.models import AuditLog

BASE = "/api/v1/admin/knowledge"


@pytest.fixture
def admin(login):
    return login("admin")


@pytest.fixture
def doctor(login):
    return login("bs")


@pytest.fixture(autouse=True)
def _no_open_release(owner_engine, users):
    """Mỗi lúc chỉ một bản đang mở: dọn bản Draft/PendingApproval còn sót trước và sau mỗi test."""
    def clean():
        with owner_engine.begin() as conn:
            rid = conn.execute(text("SELECT release_id FROM knowledge_release "
                                    "WHERE status IN ('Draft','PendingApproval')")).scalars().all()
            for t in ("triage_rule", "guideline_excerpt", "condition_symptom", "condition", "symptom"):
                conn.execute(text(f"DELETE FROM {t} WHERE release_id = ANY(:r)"), {"r": rid})
            conn.execute(text("DELETE FROM knowledge_release WHERE release_id = ANY(:r)"), {"r": rid})
    clean()
    yield
    clean()


@pytest.fixture
def tag():
    return uuid.uuid4().hex[:6]


@pytest.fixture
def source_id(client, admin):
    r = client.post(f"{BASE}/sources", headers=admin, json={
        "title": "Hướng dẫn thử API", "organization": "Bộ Y tế", "edition": f"QĐ {uuid.uuid4().hex[:8]}"})
    assert r.status_code == 201, r.text
    return r.json()["source_id"]


def _release(client, admin, label=None):
    r = client.post(f"{BASE}/releases", headers=admin, json={"label": label or f"KB-T-{uuid.uuid4().hex[:6]}"})
    assert r.status_code == 201, r.text
    return r.json()["release_id"]


def _ok(r, code=200):
    assert r.status_code == code, r.text
    return r.json()


def _draft_set(client, admin, tag, source_id):
    """Một bộ mục mới đầy đủ: 2 triệu chứng, 1 bệnh, 2 quan hệ, 1 trích dẫn, 1 luật."""
    s1, s2, c = f"ka_s1_{tag}", f"ka_s2_{tag}", f"ka_c_{tag}"
    _ok(client.put(f"{BASE}/symptoms/{s1}", headers=admin, json={"symptom_name": "Triệu chứng 1", "category": "test"}))
    _ok(client.put(f"{BASE}/symptoms/{s2}", headers=admin, json={"symptom_name": "Triệu chứng 2"}))
    _ok(client.put(f"{BASE}/conditions/{c}", headers=admin, json={"name_vi": "Bệnh thử", "icd10_code": "Z00"}))
    for s, w in ((s1, 0.8), (s2, 0.5)):
        _ok(client.put(f"{BASE}/relations/{c}/{s}", headers=admin,
                       json={"polarity": "SUPPORTS", "weight": w, "is_key": s == s1, "source_id": source_id}))
    _ok(client.put(f"{BASE}/excerpts/{c}_chan_doan", headers=admin, json={
        "condition_code": c, "title": "Chẩn đoán", "content": "Nội dung diễn đạt lại.", "source_id": source_id}))
    _ok(client.put(f"{BASE}/rules/rf_ka_{tag}", headers=admin, json={
        "rule_name": "Cờ đỏ thử", "rule_type": "RED_FLAG", "reason_text": "Cấp cứu thử.", "source_id": source_id,
        "condition_logic": {"op": "AND", "args": [{"type": "symptom", "symptom_code": s1, "state": "PRESENT"},
                                                  {"type": "symptom", "symptom_code": s2, "state": "PRESENT"}]}}))
    return s1, s2, c


def _epoch():
    with engine.connect() as conn:
        return conn.execute(text("SELECT epoch FROM knowledge_epoch")).scalar()


# ---------------------------------------------------------------------------- vòng đời đầy đủ
def test_full_lifecycle(client, admin, doctor, tag, source_id, since):
    rid = _release(client, admin)
    s1, s2, c = _draft_set(client, admin, tag, source_id)

    detail = _ok(client.get(f"{BASE}/releases/{rid}", headers=doctor))
    assert detail["status"] == "Draft"
    assert sorted((ch["kind"], ch["action"]) for ch in detail["changes"]) == sorted(
        [("symptoms", "new")] * 2 + [("conditions", "new"), ("relations", "new"), ("relations", "new"),
                                     ("excerpts", "new"), ("rules", "new")])

    sub = _ok(client.post(f"{BASE}/releases/{rid}/submit", headers=admin))
    assert sub["status"] == "PendingApproval" and {ch["status"] for ch in sub["changes"]} == {"PendingApproval"}

    before = _epoch()
    app = _ok(client.post(f"{BASE}/releases/{rid}/approve", headers=doctor))
    assert app["status"] == "Active" and app["approved_by"] and {ch["status"] for ch in app["changes"]} == {"Active"}
    assert _epoch() > before                                             # worker sẽ nạp lại tri thức

    active = _ok(client.get(f"{BASE}/rules", headers=doctor, params={"status": "Active", "q": f"rf_ka_{tag}"}))
    assert active["total"] == 1 and active["items"][0]["values"]["resulting_priority"] == "Emergency"
    with SessionLocal() as db:
        actions = [r.action_type for r in db.scalars(select(AuditLog).where(
            AuditLog.created_at >= since, AuditLog.target_entity == "knowledge_release"))]
    assert {"CREATE", "UPDATE", "APPROVE"} <= set(actions)


def test_roles(client, admin, doctor, login, tag, source_id):
    nurse = login("yta")
    assert client.get(f"{BASE}/releases", headers=nurse).status_code == 403
    assert client.post(f"{BASE}/releases", headers=doctor, json={"label": "KB-X"}).status_code == 403
    rid = _release(client, admin)
    assert client.put(f"{BASE}/symptoms/ka_r_{tag}", headers=doctor, json={"symptom_name": "x"}).status_code == 403
    _ok(client.put(f"{BASE}/symptoms/ka_r_{tag}", headers=admin, json={"symptom_name": "x"}))
    _ok(client.post(f"{BASE}/releases/{rid}/submit", headers=admin))
    assert client.post(f"{BASE}/releases/{rid}/approve", headers=admin).status_code == 403   # chỉ Physician
    assert client.post(f"{BASE}/sources", headers=doctor, json={
        "title": "x", "organization": "y", "edition": "z"}).status_code == 403


# ---------------------------------------------------------------------------- sửa, từ chối, phiên bản
def test_edit_reject_and_versions(client, admin, doctor, tag, source_id):
    rid = _release(client, admin)
    s1, s2, c = _draft_set(client, admin, tag, source_id)
    _ok(client.post(f"{BASE}/releases/{rid}/submit", headers=admin))
    _ok(client.post(f"{BASE}/releases/{rid}/approve", headers=doctor))

    rid2 = _release(client, admin)
    # giống hệt bản Active -> không tạo phiên bản thừa
    r = client.put(f"{BASE}/conditions/{c}", headers=admin, json={"name_vi": "Bệnh thử", "icd10_code": "Z00"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "NO_CHANGE"
    v2 = _ok(client.put(f"{BASE}/conditions/{c}", headers=admin, json={"name_vi": "Bệnh thử (sửa)", "icd10_code": "Z00"}))
    assert v2["version"] == 2 and v2["status"] == "Draft"
    again = _ok(client.put(f"{BASE}/conditions/{c}", headers=admin, json={"name_vi": "Bệnh thử (sửa 2)", "icd10_code": "Z00"}))
    assert again["version"] == 2                                       # sửa tiếp: cùng dòng nháp

    change = next(ch for ch in _ok(client.get(f"{BASE}/releases/{rid2}", headers=admin))["changes"]
                  if ch["kind"] == "conditions")
    assert change["action"] == "changed" and change["active_values"]["name_vi"] == "Bệnh thử"

    _ok(client.post(f"{BASE}/releases/{rid2}/submit", headers=admin))
    assert client.put(f"{BASE}/conditions/{c}", headers=admin,
                      json={"name_vi": "y"}).json()["error"]["code"] == "RELEASE_LOCKED"
    r = client.post(f"{BASE}/releases/{rid2}/reject", headers=doctor, json={"note": "Thiếu mã ICD chính xác"})
    rej = _ok(r)
    assert rej["status"] == "Draft" and rej["review_note"] == "Thiếu mã ICD chính xác"
    _ok(client.put(f"{BASE}/conditions/{c}", headers=admin, json={"name_vi": "Bệnh thử (sửa 3)", "icd10_code": "Z01"}))
    _ok(client.post(f"{BASE}/releases/{rid2}/submit", headers=admin))
    _ok(client.post(f"{BASE}/releases/{rid2}/approve", headers=doctor))

    versions = _ok(client.get(f"{BASE}/conditions/{c}/versions", headers=doctor))
    assert [(v["version"], v["status"], v["retired_reason"]) for v in versions] == [
        (2, "Active", None), (1, "Retired", "Superseded")]
    assert versions[0]["values"]["icd10_code"] == "Z01"
    rel_versions = _ok(client.get(f"{BASE}/relations/{c}/{s1}/versions", headers=doctor))
    assert rel_versions[0]["key"] == f"{c}/{s1}" and rel_versions[0]["values"]["weight"] == 0.8


def test_drop_draft(client, admin, tag):
    rid = _release(client, admin)
    _ok(client.put(f"{BASE}/symptoms/ka_d_{tag}", headers=admin, json={"symptom_name": "Bỏ đi"}))
    assert client.delete(f"{BASE}/symptoms/ka_d_{tag}/draft", headers=admin).status_code == 204
    assert _ok(client.get(f"{BASE}/releases/{rid}", headers=admin))["changes"] == []
    r = client.post(f"{BASE}/releases/{rid}/submit", headers=admin)
    assert r.status_code == 409 and r.json()["error"]["code"] == "RELEASE_EMPTY"
    assert client.delete(f"{BASE}/symptoms/ka_d_{tag}/draft", headers=admin).status_code == 404


# ---------------------------------------------------------------------------- kiểm tra dữ liệu
def test_validation(client, admin, tag, source_id):
    r = client.put(f"{BASE}/symptoms/ka_{tag}", headers=admin, json={"symptom_name": "x"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "NO_OPEN_RELEASE"
    rid = _release(client, admin)
    r = client.post(f"{BASE}/releases", headers=admin, json={"label": "KB-KHAC"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "RELEASE_ALREADY_OPEN"

    assert client.put(f"{BASE}/symptoms/Sot-Cao", headers=admin,
                      json={"symptom_name": "x"}).json()["error"]["code"] == "INVALID_KEY"
    r = client.put(f"{BASE}/rules/pf_ka_{tag}", headers=admin, json={
        "rule_name": "x", "rule_type": "RED_FLAG", "reason_text": "x", "source_id": source_id,
        "condition_logic": {"type": "vital", "vital": "spo2_pct", "cmp": "<", "value": 92}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_KEY"           # rf_ cho RED_FLAG
    r = client.put(f"{BASE}/rules/rf_ka_{tag}", headers=admin, json={
        "rule_name": "x", "rule_type": "RED_FLAG", "reason_text": "x", "source_id": source_id,
        "condition_logic": {"type": "vital", "vital": "spo2", "cmp": "lt", "value": 92}})
    assert r.status_code == 422                                                          # condition_logic sai
    r = client.put(f"{BASE}/rules/rf_ka_{tag}", headers=admin, json={
        "rule_name": "x", "rule_type": "RED_FLAG", "reason_text": "x", "source_id": source_id,
        "condition_logic": {"type": "symptom", "symptom_code": "khong_co_ma", "state": "PRESENT"}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_CODE"
    r = client.put(f"{BASE}/relations/ka_c_{tag}/ka_s_{tag}", headers=admin,
                   json={"polarity": "SUPPORTS", "weight": 0.5, "source_id": source_id})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_CODE"
    r = client.put(f"{BASE}/relations/ka_c_{tag}/ka_s_{tag}", headers=admin,
                   json={"polarity": "SUPPORTS", "weight": 1.234, "source_id": source_id})
    assert r.status_code == 422                                                          # DECIMAL(3,2)
    _ok(client.put(f"{BASE}/symptoms/ka_s_{tag}", headers=admin, json={"symptom_name": "x"}))
    r = client.put(f"{BASE}/excerpts/ka_e_{tag}", headers=admin, json={
        "condition_code": f"ka_c_{tag}", "title": "x", "content": "x", "source_id": str(uuid.uuid4())})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_SOURCE"


def test_duplicate_source_and_label(client, admin, source_id, wk_knowledge):
    srcs = _ok(client.get(f"{BASE}/sources", headers=admin))
    mine = next(s for s in srcs if s["source_id"] == source_id)
    r = client.post(f"{BASE}/sources", headers=admin, json={
        "title": "khác", "organization": mine["organization"], "edition": mine["edition"]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "DUPLICATE_SOURCE"
    r = client.post(f"{BASE}/releases", headers=admin, json={"label": "TEST-WK"})          # nhãn đã có
    assert r.status_code == 409 and r.json()["error"]["code"] == "DUPLICATE_LABEL"


# ---------------------------------------------------------------------------- tắt khẩn cấp
def test_deactivate_cascades(client, admin, doctor, tag, source_id, since):
    rid = _release(client, admin)
    s1, s2, c = _draft_set(client, admin, tag, source_id)
    _ok(client.post(f"{BASE}/releases/{rid}/submit", headers=admin))
    _ok(client.post(f"{BASE}/releases/{rid}/approve", headers=doctor))

    prev = _ok(client.get(f"{BASE}/symptoms/{s2}/dependents", headers=admin))
    assert prev["dependents"] == [{"kind": "relations", "key": f"{c}/{s2}"}, {"kind": "rules", "key": f"rf_ka_{tag}"}]

    r = client.post(f"{BASE}/symptoms/{s2}/deactivate", headers=admin,
                    json={"reason": "Mã sai", "confirm_dependents": [prev["dependents"][0]]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "DEPENDENTS_CHANGED"

    before = _epoch()
    done = _ok(client.post(f"{BASE}/symptoms/{s2}/deactivate", headers=admin,
                           json={"reason": "Mã sai", "confirm_dependents": prev["dependents"]}))
    assert done == prev["dependents"] and _epoch() > before
    for kind, key in (("symptoms", s2), ("relations", f"{c}/{s2}"), ("rules", f"rf_ka_{tag}")):
        v = _ok(client.get(f"{BASE}/{kind}/{key}/versions", headers=admin))[0]
        assert (v["status"], v["retired_reason"]) == ("Retired", "Deactivated")
    assert _ok(client.get(f"{BASE}/symptoms/{s1}/versions", headers=admin))[0]["status"] == "Active"
    with SessionLocal() as db:
        retire = db.scalar(select(AuditLog).where(AuditLog.created_at >= since, AuditLog.action_type == "RETIRE"))
    assert retire.new_values["key"] == s2 and len(retire.new_values["cascade"]) == 2

    # bật lại = phiên bản mới qua bản phát hành + duyệt
    rid2 = _release(client, admin)
    v2 = _ok(client.put(f"{BASE}/symptoms/{s2}", headers=admin, json={"symptom_name": "Triệu chứng 2"}))
    assert v2["version"] == 2
    _ok(client.post(f"{BASE}/releases/{rid2}/submit", headers=admin))
    _ok(client.post(f"{BASE}/releases/{rid2}/approve", headers=doctor))
    assert _ok(client.get(f"{BASE}/symptoms/{s2}/versions", headers=admin))[0]["status"] == "Active"


def test_condition_deactivate_and_missing_item(client, admin, doctor, tag, source_id):
    rid = _release(client, admin)
    s1, s2, c = _draft_set(client, admin, tag, source_id)
    _ok(client.post(f"{BASE}/releases/{rid}/submit", headers=admin))
    _ok(client.post(f"{BASE}/releases/{rid}/approve", headers=doctor))
    prev = _ok(client.get(f"{BASE}/conditions/{c}/dependents", headers=admin))["dependents"]
    assert {d["kind"] for d in prev} == {"relations", "excerpts"} and len(prev) == 3
    _ok(client.post(f"{BASE}/conditions/{c}/deactivate", headers=admin, json={"reason": "Ngoài phạm vi",
                                                                              "confirm_dependents": prev}))
    assert client.get(f"{BASE}/conditions/{c}/dependents", headers=admin).status_code == 404   # đã tắt
    assert client.get(f"{BASE}/conditions/khong_co/versions", headers=admin).status_code == 404


def test_integrity_blocks_approval(client, admin, doctor, tag, source_id):
    """Bản chờ duyệt chứa quan hệ tới một triệu chứng vừa bị tắt khẩn cấp -> duyệt bị CSDL chặn (409)."""
    rid = _release(client, admin)
    s1, s2, c = _draft_set(client, admin, tag, source_id)
    _ok(client.post(f"{BASE}/releases/{rid}/submit", headers=admin))
    _ok(client.post(f"{BASE}/releases/{rid}/approve", headers=doctor))

    rid2 = _release(client, admin)
    _ok(client.put(f"{BASE}/relations/{c}/{s1}", headers=admin,
                   json={"polarity": "SUPPORTS", "weight": 0.9, "is_key": True, "source_id": source_id}))
    _ok(client.post(f"{BASE}/releases/{rid2}/submit", headers=admin))
    deps = _ok(client.get(f"{BASE}/symptoms/{s1}/dependents", headers=admin))["dependents"]
    _ok(client.post(f"{BASE}/symptoms/{s1}/deactivate", headers=admin, json={"reason": "Sai", "confirm_dependents": deps}))

    r = client.post(f"{BASE}/releases/{rid2}/approve", headers=doctor)
    assert r.status_code == 409 and r.json()["error"]["code"] == "KNOWLEDGE_INTEGRITY"
    assert "SYMPTOM_NOT_ACTIVE" in r.json()["error"]["details"][0]["message"]
    assert _ok(client.get(f"{BASE}/releases/{rid2}", headers=admin))["status"] == "PendingApproval"   # không đổi


def test_list_items_filters(client, admin, wk_knowledge):
    page = _ok(client.get(f"{BASE}/symptoms", headers=admin, params={"status": "Active", "q": "wk_", "limit": 2}))
    assert page["total"] >= 4 and len(page["items"]) == 2
    assert all(i["status"] == "Active" and i["key"].startswith("wk_") for i in page["items"])
    assert client.get(f"{BASE}/khong_ton_tai", headers=admin).status_code == 422
