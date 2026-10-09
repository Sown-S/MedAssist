"""Hàm nội bộ mark_prescribed / mark_finished (bước 5 gọi) — điều kiện chuyển trạng thái."""
import datetime
import uuid

import pytest

from app.core.database import SessionLocal
from app.exceptions import AppError
from app.models import Diagnosis, Patient, User, Visit
from app.services import queue_service


@pytest.fixture
def examining(users):
    """Một lượt khám đang Examining bởi 'bs'. Trả (session, visit_id) — test tự rollback."""
    db = SessionLocal()
    p = Patient(full_name=f"Nội Bộ {uuid.uuid4().hex[:6]}", date_of_birth=datetime.date(1970, 1, 1), gender="Male")
    db.add(p)
    db.flush()
    v = Visit(patient_id=p.patient_id, nurse_id=users["yta"].user_id, chief_complaint="x",
              status="Examining", physician_id=users["bs"].user_id)
    db.add(v)
    db.flush()
    yield db, v.visit_id
    db.rollback()
    db.close()


def _doctor(db, users, name="bs") -> User:
    return db.get(User, users[name].user_id)


def test_prescribed_requires_confirmed_diagnosis(examining, users):
    db, vid = examining
    with pytest.raises(AppError) as exc:
        queue_service.mark_prescribed(db, vid, _doctor(db, users))
    assert exc.value.code == "DIAGNOSIS_REQUIRED"

    db.add(Diagnosis(visit_id=vid, physician_id=users["bs"].user_id, diagnosis_name="Viêm họng",
                     confirmed_by_physician=False))
    db.flush()
    with pytest.raises(AppError):                       # chưa xác nhận thì chưa tính
        queue_service.mark_prescribed(db, vid, _doctor(db, users))

    db.add(Diagnosis(visit_id=vid, physician_id=users["bs"].user_id, diagnosis_name="Viêm họng cấp",
                     is_primary=False, confirmed_by_physician=True, confirmed_at=datetime.datetime.now(datetime.UTC)))
    db.flush()
    assert queue_service.mark_prescribed(db, vid, _doctor(db, users)).status == "Prescribed"


def test_prescribed_only_by_examining_physician(examining, users):
    db, vid = examining
    db.add(Diagnosis(visit_id=vid, physician_id=users["bs"].user_id, diagnosis_name="X",
                     confirmed_by_physician=True, confirmed_at=datetime.datetime.now(datetime.UTC)))
    db.flush()
    other = User(username=f"bs_{uuid.uuid4().hex[:6]}", password_hash="x", full_name="BS khác", role="Physician")
    db.add(other)
    db.flush()
    with pytest.raises(AppError) as exc:
        queue_service.mark_prescribed(db, vid, other)
    assert exc.value.code == "NOT_YOUR_VISIT"


def test_finished_only_from_prescribed(examining, users):
    db, vid = examining
    nurse = db.get(User, users["yta"].user_id)
    with pytest.raises(AppError) as exc:
        queue_service.mark_finished(db, vid, nurse)
    assert exc.value.status_code == 409
    db.add(Diagnosis(visit_id=vid, physician_id=users["bs"].user_id, diagnosis_name="X",
                     confirmed_by_physician=True, confirmed_at=datetime.datetime.now(datetime.UTC)))
    db.flush()
    queue_service.mark_prescribed(db, vid, _doctor(db, users))
    v = queue_service.mark_finished(db, vid, nurse)
    assert v.status == "Finished" and v.finished_at is not None
    with pytest.raises(AppError):
        queue_service.release(db, vid, _doctor(db, users))
