"""Bệnh nhân (US04, FR04): tạo, sửa, tìm. Không xóa bệnh nhân (giữ hồ sơ bệnh án).

Nhật ký: dòng CREATE/UPDATE của bệnh nhân chỉ ghi TÊN trường thay đổi, không ghi giá trị —
Admin xem được audit_log nhưng không được xem dữ liệu bệnh nhân (tối thiểu hóa, Nghị định 13).

Phần cuối file: tra cứu nhanh, lịch sử khám và xem lại một lượt khám (US04).
"""
import re
import uuid
from datetime import date

from sqlalchemy import String, cast, extract, func, select
from sqlalchemy.orm import Session

from app.exceptions import AppError, NotFoundError
from app.models import Diagnosis, Drug, Invoice, Patient, Prescription, PrescriptionItem, User, Visit
from app.schemas.patient import PatientCreate, PatientSummary, PatientUpdate
from app.services import audit_service as audit
from app.services import service_order_service

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
                    limit: int, offset: int, code: str | None = None,
                    birth_year: int | None = None) -> tuple[int, list[Patient]]:
    """Tìm theo tên không dấu (chứa chuỗi), SĐT, CCCD, mã BN (khớp chính xác) và năm sinh.
    Các điều kiện kết hợp bằng AND. Không lọc = mới nhất trước."""
    stmt = select(Patient)
    if q:
        stmt = stmt.where(_name_contains(q))
    if phone:
        stmt = stmt.where(Patient.phone == phone)
    if id_number:
        stmt = stmt.where(Patient.id_number == id_number)
    if code:
        stmt = stmt.where(cast(Patient.patient_id, String).like(code + "%"))
    if birth_year:
        stmt = stmt.where(extract("year", Patient.date_of_birth) == birth_year)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    order = (Patient.full_name, Patient.date_of_birth) if q else (Patient.created_at.desc(),)
    rows = db.scalars(stmt.order_by(*order).limit(limit).offset(offset)).all()
    return total or 0, list(rows)


# ============================================================================ Tra cứu nhanh (US04)
# Một ô tìm kiếm cho quầy tiếp đón: hệ thống tự đoán người dùng gõ gì.
#   BN-3F2A9C1B / 3f2a9c1b / UUID đầy đủ  -> mã bệnh nhân
#   12 hoặc 9 chữ số                       -> CCCD / CMND
#   10 chữ số bắt đầu 0, hoặc +84...       -> số điện thoại
#   4 chữ số (1890..năm nay)               -> năm sinh
#   chữ (+ năm sinh ở cuối, tùy chọn)      -> họ tên không dấu (+ năm sinh)
_CODE_RE = re.compile(r"^(?:BN-?)?([0-9a-f]{8})$", re.IGNORECASE)
_DIGIT_NOISE = re.compile(r"[\s.\-()]")
_TRAILING_YEAR = re.compile(r"^(.*\S)\s+(\d{4})$")
MIN_BIRTH_YEAR = 1890


def _valid_year(y: int) -> bool:
    return MIN_BIRTH_YEAR <= y <= date.today().year


def interpret_term(term: str) -> dict:
    """Trả {'kind': ..., 'value': ..., 'name': ..., 'birth_year': ...}. Không truy cập DB."""
    t = re.sub(r"\s+", " ", term).strip()
    if not t:
        raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                       [{"field": "term", "in": "query", "message": "Không được để trống"}])
    try:
        return {"kind": "patient_code", "value": str(uuid.UUID(t))}
    except ValueError:
        pass
    m = _CODE_RE.match(t)
    if m:
        return {"kind": "patient_code", "value": m.group(1).lower()}

    digits = _DIGIT_NOISE.sub("", t)
    if digits.startswith("+84") and digits[3:].isdigit():
        digits = "0" + digits[3:]
    if digits.isdigit():
        if len(digits) in (9, 12):
            return {"kind": "id_number", "value": digits}
        if len(digits) == 10 and digits.startswith("0"):
            return {"kind": "phone", "value": digits}
        if len(digits) == 4 and _valid_year(int(digits)):
            return {"kind": "birth_year", "birth_year": int(digits)}
        raise AppError(422, "LOOKUP_UNRECOGNIZED",
                       "Không nhận ra dãy số: nhập SĐT 10 số, CCCD 12 số, CMND 9 số hoặc năm sinh 4 số",
                       [{"field": "term", "in": "query"}])

    m = _TRAILING_YEAR.match(t)
    if m and _valid_year(int(m.group(2))):
        return {"kind": "name_birth_year", "name": m.group(1), "birth_year": int(m.group(2))}
    if len(t) > 100:
        raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                       [{"field": "term", "in": "query", "message": "Tối đa 100 ký tự"}])
    return {"kind": "name", "name": t}


def _name_contains(q: str):
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return _name_key(Patient.full_name).like("%" + func.lower(func.f_unaccent(escaped)) + "%", escape="\\")


def quick_lookup(db: Session, term: str, *, limit: int, offset: int) -> tuple[dict, int, list[dict]]:
    """Tra cứu nhanh. Kết quả kèm số lượt khám và lần khám gần nhất (bỏ lượt đã hủy),
    bệnh nhân khám gần đây xếp trước. Không trả số CCCD đầy đủ, chỉ 4 số cuối."""
    it = interpret_term(term)
    stmt = select(Patient)
    kind = it["kind"]
    if kind == "patient_code":
        if len(it["value"]) == 36:
            stmt = stmt.where(Patient.patient_id == uuid.UUID(it["value"]))
        else:
            stmt = stmt.where(cast(Patient.patient_id, String).like(it["value"] + "%"))
    elif kind == "id_number":
        stmt = stmt.where(Patient.id_number == it["value"])
    elif kind == "phone":
        stmt = stmt.where(Patient.phone == it["value"])
    if it.get("name"):
        stmt = stmt.where(_name_contains(it["name"]))
    if it.get("birth_year"):
        stmt = stmt.where(extract("year", Patient.date_of_birth) == it["birth_year"])

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    visits = (select(Visit.patient_id, func.count().label("n"), func.max(Visit.visit_date).label("last"))
              .where(Visit.status != "Cancelled").group_by(Visit.patient_id).subquery())
    page = (stmt.add_columns(func.coalesce(visits.c.n, 0), visits.c.last)
            .outerjoin(visits, visits.c.patient_id == Patient.patient_id)
            .order_by(visits.c.last.desc().nulls_last(), Patient.full_name, Patient.patient_id)
            .limit(limit).offset(offset))
    items = [{"patient_id": p.patient_id, "full_name": p.full_name, "date_of_birth": p.date_of_birth,
              "gender": p.gender, "phone": p.phone,
              "id_number_last4": p.id_number[-4:] if p.id_number else None,
              "visit_count": n, "last_visit_at": last}
             for p, n, last in db.execute(page).all()]
    interpretation = {k: it[k] for k in ("kind", "name", "birth_year") if k in it}
    return interpretation, total, items


# ============================================================================ Lịch sử khám (US04)
def _user_names(db: Session, ids: set) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return dict(db.execute(select(User.user_id, User.full_name).where(User.user_id.in_(ids))).all())


def _drug_label(d: Drug) -> str:
    base = f"{d.generic_name} {d.strength}"
    return base if d.trade_name in (d.generic_name, base) else f"{base} ({d.trade_name})"


def _active_prescriptions(db: Session, visit_ids: list) -> dict:
    """visit_id -> (Prescription, [(PrescriptionItem, Drug)]) cho đơn còn hiệu lực
    (không tính đơn Cancelled — đơn bị mở lại, và không tính đơn nháp của lượt đã kết thúc)."""
    if not visit_ids:
        return {}
    rxs = db.scalars(select(Prescription).where(Prescription.visit_id.in_(visit_ids),
                                                Prescription.status != "Cancelled")).all()
    out = {rx.visit_id: (rx, []) for rx in rxs}
    if not rxs:
        return out
    by_rx = {rx.prescription_id: rx.visit_id for rx in rxs}
    rows = db.execute(select(PrescriptionItem, Drug).join(Drug, Drug.drug_id == PrescriptionItem.drug_id)
                      .where(PrescriptionItem.prescription_id.in_(list(by_rx)))
                      .order_by(PrescriptionItem.prescription_id, Drug.generic_name, PrescriptionItem.item_id)).all()
    for item, drug in rows:
        out[by_rx[item.prescription_id]][1].append((item, drug))
    return out


def _drug_line(item: PrescriptionItem, drug: Drug) -> dict:
    return {"drug_label": _drug_label(drug), "quantity": item.quantity, "unit": drug.unit,
            "dosage": item.dosage, "frequency": item.frequency, "duration_days": item.duration_days,
            "dispense_status": item.dispense_status}


def patient_history(db: Session, patient_id: uuid.UUID, *, limit: int, offset: int,
                    include_cancelled: bool) -> dict:
    """Lịch sử khám mới nhất trước, mỗi lượt kèm chẩn đoán ĐÃ XÁC NHẬN và tóm tắt đơn thuốc.
    Số truy vấn cố định (không N+1): 1 bệnh nhân, 1 đếm, 1 lượt khám, 1 chẩn đoán, 2 đơn, 1 tên bác sĩ."""
    patient = get_patient(db, patient_id)
    stmt = select(Visit).where(Visit.patient_id == patient_id)
    if not include_cancelled:
        stmt = stmt.where(Visit.status != "Cancelled")
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    visits = db.scalars(stmt.order_by(Visit.visit_date.desc(), Visit.visit_id).limit(limit).offset(offset)).all()
    ids = [v.visit_id for v in visits]

    dx_by_visit: dict = {i: [] for i in ids}
    if ids:
        for d in db.scalars(select(Diagnosis).where(Diagnosis.visit_id.in_(ids),
                                                    Diagnosis.confirmed_by_physician.is_(True))
                            .order_by(Diagnosis.is_primary.desc(), Diagnosis.created_at)):
            dx_by_visit[d.visit_id].append({"diagnosis_name": d.diagnosis_name, "icd10_code": d.icd10_code,
                                            "is_primary": d.is_primary})
    rx_by_visit = _active_prescriptions(db, ids)
    names = _user_names(db, {v.physician_id for v in visits})

    items = []
    for v in visits:
        rx = rx_by_visit.get(v.visit_id)
        prescription = None
        if rx and rx[0].status != "Draft":      # đơn nháp chưa phải đơn đã kê
            lines = [_drug_line(i, d) for i, d in rx[1]]
            prescription = {"prescription_id": rx[0].prescription_id, "status": rx[0].status,
                            "confirmed_at": rx[0].confirmed_at, "item_count": len(lines), "items": lines}
        items.append({"visit_id": v.visit_id, "visit_date": v.visit_date, "status": v.status,
                      "chief_complaint": v.chief_complaint, "triage_priority": v.triage_priority,
                      "is_red_flag": v.is_red_flag, "outcome": v.outcome,
                      "referral_facility": (v.referral or {}).get("facility_name"),
                      "physician_name": names.get(v.physician_id),
                      "diagnoses": dx_by_visit[v.visit_id], "prescription": prescription})
    return {"patient": patient, "total": total, "limit": limit, "offset": offset, "items": items}


def visit_record(db: Session, visit_id: uuid.UUID) -> dict:
    """Toàn bộ một lượt khám để xem lại: lượt khám + sinh hiệu, mọi chẩn đoán (kể cả đã rút lại),
    đơn thuốc còn hiệu lực (kể cả nháp nếu lượt đang khám), phiếu chỉ định kèm kết quả, tóm tắt hóa đơn."""
    visit = db.get(Visit, visit_id)
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    patient = get_patient(db, visit.patient_id)
    diagnoses = db.scalars(select(Diagnosis).where(Diagnosis.visit_id == visit_id)
                           .order_by(Diagnosis.confirmed_by_physician.desc(), Diagnosis.is_primary.desc(),
                                     Diagnosis.created_at)).all()
    prescription = None
    rx = _active_prescriptions(db, [visit_id]).get(visit_id)
    if rx:
        prescription = {"prescription_id": rx[0].prescription_id, "status": rx[0].status,
                        "confirmed_at": rx[0].confirmed_at,
                        "items": [{**_drug_line(i, d), "item_id": i.item_id, "instruction": i.instruction,
                                   "skip_reason": i.skip_reason} for i, d in rx[1]]}
    inv = db.scalar(select(Invoice).where(Invoice.visit_id == visit_id, Invoice.payment_status != "Cancelled"))
    invoice = None if inv is None else {"invoice_code": inv.invoice_code, "total_amount": inv.total_amount,
                                        "payment_status": inv.payment_status, "paid_at": inv.paid_at}
    names = _user_names(db, {visit.nurse_id, visit.physician_id})
    return {"patient": patient, "visit": visit, "nurse_name": names.get(visit.nurse_id),
            "physician_name": names.get(visit.physician_id), "diagnoses": list(diagnoses),
            "prescription": prescription, "invoice": invoice,
            "service_orders": service_order_service.orders_for_visits(db, [visit_id]).get(visit_id, [])}
