"""Bệnh nhân (US04, FR04): tạo, sửa, tìm. Không xóa bệnh nhân (giữ hồ sơ bệnh án).

Nhật ký: dòng CREATE/UPDATE của bệnh nhân chỉ ghi TÊN trường thay đổi, không ghi giá trị —
Admin xem được audit_log nhưng không được xem dữ liệu bệnh nhân (tối thiểu hóa, Nghị định 13).
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.exceptions import AppError, NotFoundError
from app.models import Patient, User
from app.schemas.patient import PatientCreate, PatientSummary, PatientUpdate
from app.services import audit_service as audit

MAX_DUPLICATE_CANDIDATES = 10


def _name_key(column_or_value):
    """Cùng biểu thức với chỉ mục idx_patient_name_trgm."""
    return func.lower(func.f_unaccent(column_or_value))


def get_patient(db: Session, patient_id: uuid.UUID) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise NotFoundError("Không tìm thấy bệnh nhân")
    return patient


def _check_id_number(db: Session, id_number: str | None, exclude: uuid.UUID | None = None) -> None:
    if not id_number:
        return
    stmt = select(Patient.patient_id).where(Patient.id_number == id_number)
    if exclude:
        stmt = stmt.where(Patient.patient_id != exclude)
    existing = db.scalar(stmt)
    if existing:
        raise AppError(409, "DUPLICATE_ID_NUMBER", "Số CCCD đã thuộc về một bệnh nhân khác",
                       [{"field": "id_number", "in": "body", "patient_id": str(existing)}])


def create_patient(db: Session, data: PatientCreate, actor: User) -> Patient:
    _check_id_number(db, data.id_number)

    if not data.confirm_duplicate:
        candidates = db.scalars(
            select(Patient).where(_name_key(Patient.full_name) == _name_key(data.full_name),
                                  Patient.date_of_birth == data.date_of_birth)
            .order_by(Patient.created_at).limit(MAX_DUPLICATE_CANDIDATES)).all()
        if candidates:
            raise AppError(409, "POSSIBLE_DUPLICATE",
                           "Đã có bệnh nhân cùng họ tên và ngày sinh. Kiểm tra lại; nếu đúng là người khác, "
                           "gửi lại với confirm_duplicate = true",
                           [PatientSummary.model_validate(c).model_dump(mode="json") for c in candidates])

    fields = data.model_dump(exclude={"confirm_duplicate"}, exclude_none=True)
    patient = Patient(**fields)
    db.add(patient)
    db.flush()
    audit.record(db, action="CREATE", entity="patient", entity_id=patient.patient_id,
                 actor_id=actor.user_id,
                 new_values={"fields": sorted(fields), "confirmed_duplicate": data.confirm_duplicate})
    return patient


def update_patient(db: Session, patient_id: uuid.UUID, data: PatientUpdate, actor: User) -> Patient:
    patient = db.scalar(select(Patient).where(Patient.patient_id == patient_id).with_for_update())
    if patient is None:
        raise NotFoundError("Không tìm thấy bệnh nhân")
    changes = data.model_dump(exclude_unset=True, mode="python")
    if "medical_history" in changes and data.medical_history is not None:
        changes["medical_history"] = data.medical_history.model_dump()
    for required in ("full_name", "date_of_birth", "gender"):
        if required in changes and changes[required] is None:
            raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                           [{"field": required, "in": "body", "message": "Không được để trống"}])
    if "id_number" in changes:
        _check_id_number(db, changes["id_number"], exclude=patient_id)

    changed = [k for k, v in changes.items() if getattr(patient, k) != v]
    for k in changed:
        setattr(patient, k, changes[k])
    if changed:
        patient.updated_at = func.now()
        audit.record(db, action="UPDATE", entity="patient", entity_id=patient.patient_id,
                     actor_id=actor.user_id, new_values={"changed_fields": sorted(changed)})
    return patient


def search_patients(db: Session, *, q: str | None, phone: str | None, id_number: str | None,
                    limit: int, offset: int) -> tuple[int, list[Patient]]:
    """Tìm theo tên không dấu (chứa chuỗi), SĐT hoặc CCCD (khớp chính xác). Không lọc = mới nhất trước."""
    stmt = select(Patient)
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(_name_key(Patient.full_name).like(
            "%" + func.lower(func.f_unaccent(escaped)) + "%", escape="\\"))
    if phone:
        stmt = stmt.where(Patient.phone == phone)
    if id_number:
        stmt = stmt.where(Patient.id_number == id_number)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    order = (Patient.full_name, Patient.date_of_birth) if q else (Patient.created_at.desc(),)
    rows = db.scalars(stmt.order_by(*order).limit(limit).offset(offset)).all()
    return total or 0, list(rows)
