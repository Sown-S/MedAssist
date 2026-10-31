"""PUT/GET /visits/{id}/symptoms: y tá xác nhận triệu chứng (HITL), đầu vào của AI."""
import uuid

import pytest


@pytest.fixture
def visit_id(client, nurse):
    pid = client.post("/api/v1/patients", headers=nurse, json={
        "full_name": f"Triệu Chứng {uuid.uuid4().hex[:6]}", "date_of_birth": "1990-05-01", "gender": "Female"}).json()["patient_id"]
    return client.post("/api/v1/visits", headers=nurse, json={"patient_id": pid, "chief_complaint": "Sốt ho"}).json()["visit_id"]


def _put(client, headers, vid, items):
    return client.put(f"/api/v1/visits/{vid}/symptoms", headers=headers, json={"symptoms": items})


def test_put_and_get(client, nurse, visit_id, wk_knowledge):
    r = _put(client, nurse, visit_id, [{"symptom_code": "wk_fever_high", "state": "PRESENT"},
                                       {"symptom_code": "wk_cough_dry", "state": "ABSENT", "source": "Extracted"}])
    assert r.status_code == 200, r.text
    got = {s["symptom_code"]: s for s in client.get(f"/api/v1/visits/{visit_id}/symptoms", headers=nurse).json()}
    assert got["wk_fever_high"]["state"] == "PRESENT" and got["wk_fever_high"]["symptom_name"] == "Sốt cao"
    assert got["wk_cough_dry"]["state"] == "ABSENT" and got["wk_cough_dry"]["source"] == "Extracted"


def test_removed_code_becomes_unknown(client, nurse, visit_id, wk_knowledge):
    _put(client, nurse, visit_id, [{"symptom_code": "wk_fever_high", "state": "PRESENT"},
                                   {"symptom_code": "wk_sore_throat", "state": "PRESENT"}])
    rows = _put(client, nurse, visit_id, [{"symptom_code": "wk_fever_high", "state": "PRESENT"}]).json()
    assert {s["symptom_code"]: s["state"] for s in rows} == {"wk_fever_high": "PRESENT", "wk_sore_throat": "UNKNOWN"}


def test_unknown_and_duplicate_codes(client, nurse, visit_id, wk_knowledge):
    r = _put(client, nurse, visit_id, [{"symptom_code": "khong_co_ma_nay", "state": "PRESENT"}])
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_SYMPTOM"
    r = _put(client, nurse, visit_id, [{"symptom_code": "wk_fever_high", "state": "PRESENT"},
                                       {"symptom_code": "wk_fever_high", "state": "ABSENT"}])
    assert r.status_code == 422
    r = _put(client, nurse, visit_id, [{"symptom_code": "wk_fever_high", "state": "MAYBE"}])
    assert r.status_code == 422


def test_closed_visit_and_roles(client, nurse, login, visit_id, wk_knowledge):
    assert _put(client, login("admin"), visit_id, []).status_code == 403
    client.patch(f"/api/v1/visits/{visit_id}/cancel", headers=nurse, json={"reason": "Bệnh nhân về"})
    r = _put(client, nurse, visit_id, [{"symptom_code": "wk_fever_high", "state": "PRESENT"}])
    assert r.status_code == 409 and r.json()["error"]["code"] == "VISIT_CLOSED"
    assert client.get(f"/api/v1/visits/{uuid.uuid4()}/symptoms", headers=nurse).status_code == 404


def test_audit_counts_only(client, nurse, visit_id, wk_knowledge, logs):
    _put(client, nurse, visit_id, [{"symptom_code": "wk_fever_high", "state": "PRESENT"},
                                   {"symptom_code": "wk_cough_dry", "state": "UNKNOWN"}])
    row = [r for r in logs(action="UPDATE", entity="visit") if r.new_values.get("symptoms_confirmed")][-1]
    assert row.new_values["symptoms_confirmed"] == {"PRESENT": 1, "ABSENT": 0, "UNKNOWN": 1}
    assert "wk_fever_high" not in str(row.new_values)


def test_symptom_catalog_for_clinical_roles(client, nurse, login, wk_knowledge):
    r = client.get("/api/v1/symptoms", headers=nurse)
    assert r.status_code == 200
    got = {s["symptom_code"]: s for s in r.json()}
    assert got["wk_fever_high"] == {"symptom_code": "wk_fever_high", "symptom_name": "Sốt cao", "category": "test"}
    assert client.get("/api/v1/symptoms", headers=login("bs")).status_code == 200
    assert client.get("/api/v1/symptoms", headers=login("admin")).status_code == 403
