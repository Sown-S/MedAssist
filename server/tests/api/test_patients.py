"""Bệnh nhân (US04): tạo, sửa, tìm không dấu, chống trùng, quyền, nhật ký không chứa dữ liệu."""
import uuid
from datetime import date, timedelta

import pytest


@pytest.fixture
def nurse(login):
    return login("yta")


def _name():
    return f"Nguyễn Thị Ánh {uuid.uuid4().hex[:6]}"


def _create(client, headers, **over):
    body = {"full_name": _name(), "date_of_birth": "2019-03-15", "gender": "Female", **over}
    return client.post("/api/v1/patients", json=body, headers=headers)


def test_create_patient_normalizes(client, users, nurse):
    r = _create(client, nurse, full_name="  Lê   Văn  Cường ", phone="+84 912-345-678",
                id_number=f"0{uuid.uuid4().int % 10**11:011d}", address=" 12  Nguyễn Văn Linh ",
                medical_history={"chronic_conditions": ["Hen phế quản"], "notes": "Theo dõi"},
                allergy_notes="Dị ứng penicillin")
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["full_name"] == "Lê Văn Cường" and p["phone"] == "0912345678" and p["address"] == "12 Nguyễn Văn Linh"
    assert p["medical_history"] == {"chronic_conditions": ["Hen phế quản"], "notes": "Theo dõi"}


@pytest.mark.parametrize("over, field, message", [
    ({"full_name": ""}, "full_name", "Không được để trống"),
    ({"gender": "Nam"}, "gender", None),
    ({"date_of_birth": (date.today() + timedelta(days=1)).isoformat()}, "date_of_birth", "Ngày sinh không được ở tương lai"),
    ({"date_of_birth": "1880-01-01"}, "date_of_birth", None),
    ({"id_number": "12345"}, "id_number", None),
    ({"phone": "0905"}, "phone", None),
    ({"medical_history": {"benh": "x"}}, "medical_history.benh", "Trường không được phép"),
])
def test_create_patient_validation(client, users, nurse, over, field, message):
    r = _create(client, nurse, **over)
    assert r.status_code == 422
    details = {d["field"]: d["message"] for d in r.json()["error"]["details"]}
    assert field in details and (message is None or details[field] == message)


def test_missing_required_fields(client, users, nurse):
    r = client.post("/api/v1/patients", json={}, headers=nurse)
    assert {d["field"] for d in r.json()["error"]["details"]} == {"full_name", "date_of_birth", "gender"}


def test_possible_duplicate_needs_confirmation(client, users, nurse):
    name = _name()
    first = _create(client, nurse, full_name=name).json()
    # cùng tên (khác hoa thường, bỏ dấu) + cùng ngày sinh
    unaccented = name.replace("Nguyễn Thị Ánh", "nguyen thi anh")
    r = _create(client, nurse, full_name=unaccented)
    assert r.status_code == 409
    err = r.json()["error"]
    assert err["code"] == "POSSIBLE_DUPLICATE" and err["details"][0]["patient_id"] == first["patient_id"]
    assert _create(client, nurse, full_name=unaccented, confirm_duplicate=True).status_code == 201
    assert _create(client, nurse, full_name=name, date_of_birth="2018-01-01").status_code == 201   # khác ngày sinh


def test_duplicate_id_number_blocked(client, users, nurse):
    cccd = f"0{uuid.uuid4().int % 10**11:011d}"
    first = _create(client, nurse, id_number=cccd).json()
    r = _create(client, nurse, id_number=cccd)
    assert r.status_code == 409 and r.json()["error"]["code"] == "DUPLICATE_ID_NUMBER"
    assert r.json()["error"]["details"][0]["patient_id"] == first["patient_id"]
    other = _create(client, nurse).json()
    r = client.patch(f"/api/v1/patients/{other['patient_id']}", json={"id_number": cccd}, headers=nurse)
    assert r.status_code == 409


def test_search_unaccented_phone_and_escaping(client, users, nurse, login):
    tag = uuid.uuid4().hex[:6]
    p = _create(client, nurse, full_name=f"Đặng Văn Hùng {tag}", phone="0987654321").json()
    doctor = login("bs")
    for q in (f"dang van hung {tag}", f"ĐẶNG VĂN {tag}"[:-7] + f" HÙNG {tag}", f"hùng {tag}"):
        items = client.get("/api/v1/patients", params={"q": q}, headers=doctor).json()["items"]
        assert [i["patient_id"] for i in items] == [p["patient_id"]], q
    assert client.get("/api/v1/patients", params={"phone": "+84987654321"}, headers=doctor).json()["total"] >= 1
    all_total = client.get("/api/v1/patients", headers=doctor).json()["total"]
    assert client.get("/api/v1/patients", params={"q": "%"}, headers=doctor).json()["total"] < all_total or all_total == 0


def test_get_and_update_patient_audit_has_no_values(client, users, nurse, login, logs):
    p = _create(client, nurse, phone="0911111111").json()
    pid = p["patient_id"]
    r = client.patch(f"/api/v1/patients/{pid}", json={"phone": "0922222222", "gender": "Female"}, headers=nurse)
    assert r.status_code == 200 and r.json()["phone"] == "0922222222"
    assert client.get(f"/api/v1/patients/{pid}", headers=login("bs")).status_code == 200

    create, = logs(action="CREATE", entity="patient")
    update, = logs(action="UPDATE", entity="patient")
    assert "full_name" in create.new_values["fields"] and update.new_values == {"changed_fields": ["phone"]}
    for row in (create, update):                                      # không có giá trị thật
        assert "0911111111" not in str(row.new_values) and p["full_name"] not in str(row.new_values)
    view = [v for v in logs(action="VIEW", entity="patient") if str(v.entity_id) == pid]
    assert len(view) == 1


def test_update_cannot_clear_required_field(client, users, nurse):
    pid = _create(client, nurse).json()["patient_id"]
    r = client.patch(f"/api/v1/patients/{pid}", json={"full_name": None}, headers=nurse)
    assert r.status_code == 422


def test_permissions(client, users, nurse, login):
    pid = _create(client, nurse).json()["patient_id"]
    assert _create(client, login("bs")).status_code == 403                     # bác sĩ không tạo
    assert client.get(f"/api/v1/patients/{pid}", headers=login("admin")).status_code == 403
    assert client.get("/api/v1/patients", headers=login("admin")).status_code == 403
    assert client.get(f"/api/v1/patients/{uuid.uuid4()}", headers=nurse).status_code == 404
