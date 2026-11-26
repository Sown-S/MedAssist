"""S2: bác sĩ đang khám lượt của mình sửa được is_pregnant (cùng kiểm giới tính, tuổi như lúc tiếp đón)."""

import datetime

import pytest

from tests.api.intake import save_intake


def _dob(age: int, *, birthday_passed: bool = True) -> str:
    today = datetime.date.today()
    anniversary = today.replace(year=today.year - age, day=min(today.day, 28))
    shift = datetime.timedelta(days=-2 if birthday_passed else 2)
    return (anniversary + shift).isoformat()


def _pregnant(client, headers, vid, value):
    return client.patch(f"/api/v1/visits/{vid}", headers=headers, json={"is_pregnant": value})


@pytest.mark.parametrize("value", [True, False, None])
def test_physician_of_visit_updates_pregnancy(client, doctor, examining, logs, value):
    vid = examining(gender="Female", date_of_birth=_dob(30))
    r = _pregnant(client, doctor, vid, value)
    assert r.status_code == 200, r.text
    assert r.json()["is_pregnant"] is value
    context = client.get(f"/api/v1/visits/{vid}/prescription", headers=doctor).json()["patient_context"]
    assert context["is_pregnant"] is value
    if value is not None:
        update = [row for row in logs(action="UPDATE", entity="visit") if str(row.entity_id) == vid][-1]
        assert update.new_values == {"changed_fields": ["is_pregnant"]}


def test_physician_updates_pregnancy_with_vitals(client, doctor, examining):
    vid = examining(gender="Female", date_of_birth=_dob(30))
    r = client.patch(
        f"/api/v1/visits/{vid}", headers=doctor, json={"is_pregnant": True, "vital_signs": {"weight_kg": 58.0}}
    )
    assert r.status_code == 200 and r.json()["is_pregnant"] is True


def test_physician_cannot_change_other_fields_with_pregnancy(client, doctor, examining):
    vid = examining(gender="Female", date_of_birth=_dob(30))
    r = client.patch(f"/api/v1/visits/{vid}", headers=doctor, json={"is_pregnant": True, "chief_complaint": "Khác"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "VISIT_LOCKED"
    assert client.get(f"/api/v1/visits/{vid}", headers=doctor).json()["is_pregnant"] is None


def test_other_physician_and_nurse_after_check_in_locked(client, doctor2, nurse, examining):
    vid = examining(gender="Female", date_of_birth=_dob(30))
    for headers in (doctor2, nurse):
        r = _pregnant(client, headers, vid, True)
        assert r.status_code == 409 and r.json()["error"]["code"] == "VISIT_LOCKED"


def test_nurse_after_check_in_before_exam_locked(client, nurse):
    pid = client.post(
        "/api/v1/patients",
        headers=nurse,
        json={"full_name": "Chờ khám thai", "date_of_birth": _dob(30), "gender": "Female", "confirm_duplicate": True},
    ).json()["patient_id"]
    visit = client.post("/api/v1/visits", headers=nurse, json={"patient_id": pid, "chief_complaint": "Ho"})
    vid = visit.json()["visit_id"]
    save_intake(vid)
    assert client.patch(f"/api/v1/visits/{vid}/check-in", headers=nurse).status_code == 200
    r = _pregnant(client, nurse, vid, True)
    assert r.status_code == 409 and r.json()["error"]["code"] == "VISIT_LOCKED"


def test_physician_locked_after_prescribed(client, doctor, examining, drug):
    vid = examining(gender="Female", date_of_birth=_dob(30))
    did, _ = drug({90: 50})
    item = {"drug_id": did, "dosage": "1 viên", "frequency": "2 lần/ngày", "duration_days": 3, "quantity": 6}
    dx = {"diagnosis_name": "Viêm họng cấp", "icd10_code": "J02.9"}
    assert client.post(f"/api/v1/visits/{vid}/diagnoses", headers=doctor, json=dx).status_code == 201
    assert client.put(f"/api/v1/visits/{vid}/prescription", headers=doctor, json={"items": [item]}).status_code == 200
    assert client.post(f"/api/v1/visits/{vid}/prescription/confirm", headers=doctor).status_code == 200
    r = _pregnant(client, doctor, vid, True)
    assert r.status_code == 409 and r.json()["error"]["code"] == "VISIT_LOCKED"


@pytest.mark.parametrize(
    "gender, age, birthday_passed",
    [("Male", 30, True), ("Female", 11, True), ("Female", 12, False), ("Female", 56, True)],
)
def test_pregnancy_rejected_outside_sex_or_age(client, doctor, examining, gender, age, birthday_passed):
    vid = examining(gender=gender, date_of_birth=_dob(age, birthday_passed=birthday_passed))
    r = _pregnant(client, doctor, vid, True)
    assert r.status_code == 422 and r.json()["error"]["details"][0]["field"] == "is_pregnant"
    assert _pregnant(client, doctor, vid, False).status_code == 200


@pytest.mark.parametrize("gender, age", [("Female", 12), ("Female", 55), ("Other", 30)])
def test_pregnancy_accepted_at_age_bounds_and_other_gender(client, doctor, examining, gender, age):
    vid = examining(gender=gender, date_of_birth=_dob(age))
    assert _pregnant(client, doctor, vid, True).status_code == 200


def test_admin_cannot_update_pregnancy(client, login, examining):
    vid = examining(gender="Female", date_of_birth=_dob(30))
    assert _pregnant(client, login("admin"), vid, True).status_code == 403
