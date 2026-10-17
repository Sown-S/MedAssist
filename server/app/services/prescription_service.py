"""Chẩn đoán (US02) và kê đơn (US03) — lượt 6b.

Luồng: Examining -> chẩn đoán (lưu = xác nhận) -> đơn nháp (ghi đè được) -> XÁC NHẬN: chọn lô FEFO,
trừ kho qua sổ cái, đơn Confirmed, lượt khám Prescribed, hóa đơn Pending — tất cả MỘT transaction.
Không kê đơn: 'Hoàn tất khám' -> Prescribed + hóa đơn chỉ có phí khám.
Mở lại đơn (chưa cấp thuốc, chưa thu tiền): hoàn kho, hủy đơn + hóa đơn, lượt khám về Examining.

App không có quyền DELETE: đơn nháp sửa = hủy đơn nháp cũ + tạo đơn mới; chẩn đoán rút lại =
confirmed_by_physician = FALSE (không còn tính là chẩn đoán đã xác nhận).
Nhật ký chỉ ghi tên trường / số lượng, không ghi tên bệnh hay tên thuốc (dữ liệu sức khỏe).
"""
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.exceptions import AppError, NotFoundError
from app.models import Condition, Diagnosis, Drug, Patient, Prescription, PrescriptionItem, User, Visit
from app.schemas.diagnosis import DiagnosisCreate, DiagnosisUpdate
from app.schemas.prescription import PrescriptionDraft
from app.services import audit_service as audit
from app.services import inventory_service, invoice_service, queue_service


# ============================================================================ kiểm tra chung
def _examining_visit(db: Session, visit_id: uuid.UUID, actor: User, *, lock: bool = True) -> Visit:
    stmt = select(Visit).where(Visit.visit_id == visit_id)
    visit = db.scalar(stmt.with_for_update() if lock else stmt)
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    if visit.status != "Examining":
        raise AppError(409, "VISIT_NOT_EXAMINING", "Chỉ thao tác được khi lượt khám đang khám (Examining)",
                       [{"current": visit.status}])
    if visit.physician_id != actor.user_id:
        raise AppError(409, "NOT_YOUR_VISIT", "Lượt khám này do bác sĩ khác đang khám")
    return visit


# ============================================================================ chẩn đoán
def list_diagnoses(db: Session, visit_id: uuid.UUID) -> list[Diagnosis]:
    queue_service.get_visit(db, visit_id)
    return list(db.scalars(select(Diagnosis).where(Diagnosis.visit_id == visit_id)
                           .order_by(Diagnosis.is_primary.desc(), Diagnosis.created_at)))


def _demote_primary(db: Session, visit_id: uuid.UUID, keep: uuid.UUID | None = None) -> None:
    stmt = update(Diagnosis).where(Diagnosis.visit_id == visit_id, Diagnosis.is_primary.is_(True))
    if keep:
        stmt = stmt.where(Diagnosis.diagnosis_id != keep)
    db.execute(stmt.values(is_primary=False))


def add_diagnosis(db: Session, visit_id: uuid.UUID, data: DiagnosisCreate, actor: User) -> Diagnosis:
    _examining_visit(db, visit_id, actor)
    name, icd = data.diagnosis_name, data.icd10_code
    if data.condition_code:
        cond = db.scalar(select(Condition).where(Condition.condition_code == data.condition_code,
                                                 Condition.status == "Active"))
        if cond is None:
            raise AppError(422, "UNKNOWN_CONDITION", "Mã bệnh không có trong danh sách đang dùng",
                           [{"field": "condition_code", "in": "body", "message": "Không có hoặc đã ngừng dùng"}])
        name, icd = name or cond.name_vi, icd or cond.icd10_code
    if not name:
        raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                       [{"field": "diagnosis_name", "in": "body", "message": "Nhập tên chẩn đoán hoặc chọn mã bệnh"}])
    has_primary = db.scalar(select(Diagnosis.diagnosis_id).where(
        Diagnosis.visit_id == visit_id, Diagnosis.is_primary.is_(True)).limit(1))
    is_primary = data.is_primary or not has_primary          # chẩn đoán đầu tiên luôn là chính
    if is_primary and has_primary:
        _demote_primary(db, visit_id)
    dx = Diagnosis(visit_id=visit_id, physician_id=actor.user_id, condition_code=data.condition_code,
                   icd10_code=icd, diagnosis_name=name, is_primary=is_primary,
                   clinical_notes=data.clinical_notes, confirmed_by_physician=True, confirmed_at=func.now())
    db.add(dx)
    db.flush()
    db.refresh(dx)
    audit.record(db, action="CREATE", entity="diagnosis", entity_id=dx.diagnosis_id, actor_id=actor.user_id,
                 new_values={"visit_id": str(visit_id), "is_primary": is_primary,
                             "from_condition_list": data.condition_code is not None})
    return dx


def _own_diagnosis(db: Session, diagnosis_id: uuid.UUID, actor: User) -> Diagnosis:
    dx = db.get(Diagnosis, diagnosis_id)
    if dx is None:
        raise NotFoundError("Không tìm thấy chẩn đoán")
    _examining_visit(db, dx.visit_id, actor)
    return dx


def update_diagnosis(db: Session, diagnosis_id: uuid.UUID, data: DiagnosisUpdate, actor: User) -> Diagnosis:
    dx = _own_diagnosis(db, diagnosis_id, actor)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("diagnosis_name", "x") is None or changes.get("is_primary", True) is None:
        raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                       [{"field": k, "in": "body", "message": "Không được để trống"}
                        for k in ("diagnosis_name", "is_primary") if k in changes and changes[k] is None])
    if changes.get("is_primary") is False and dx.is_primary:
        raise AppError(409, "PRIMARY_REQUIRED", "Đặt một chẩn đoán khác làm chẩn đoán chính trước")
    if changes.get("is_primary") is True and not dx.is_primary:
        _demote_primary(db, dx.visit_id, keep=dx.diagnosis_id)
    if changes.get("is_primary") is True and not dx.confirmed_by_physician:
        raise AppError(409, "DIAGNOSIS_RETRACTED", "Chẩn đoán đã rút lại không thể làm chẩn đoán chính")
    changed = [k for k, v in changes.items() if getattr(dx, k) != v]
    for k in changed:
        setattr(dx, k, changes[k])
    if changed:
        db.flush()
        audit.record(db, action="UPDATE", entity="diagnosis", entity_id=dx.diagnosis_id,
                     actor_id=actor.user_id, new_values={"changed_fields": sorted(changed)})
    db.refresh(dx)
    return dx


def retract_diagnosis(db: Session, diagnosis_id: uuid.UUID, actor: User) -> Diagnosis:
    """'Xóa' chẩn đoán nhập nhầm: không xóa dòng (giữ vết), chỉ bỏ xác nhận. Chẩn đoán chính bị rút
    thì chẩn đoán đã xác nhận cũ nhất còn lại được đặt làm chính."""
    dx = _own_diagnosis(db, diagnosis_id, actor)
    if not dx.confirmed_by_physician:
        return dx
    was_primary = dx.is_primary
    dx.confirmed_by_physician, dx.is_primary = False, False
    db.flush()
    if was_primary:
        nxt = db.scalar(select(Diagnosis).where(Diagnosis.visit_id == dx.visit_id,
                                                Diagnosis.confirmed_by_physician.is_(True))
                        .order_by(Diagnosis.created_at).limit(1))
        if nxt is not None:
            nxt.is_primary = True
            db.flush()
    audit.record(db, action="UPDATE", entity="diagnosis", entity_id=dx.diagnosis_id, actor_id=actor.user_id,
                 new_values={"retracted": True})
    db.refresh(dx)
    return dx


# ============================================================================ đơn thuốc
def _active_rx(db: Session, visit_id: uuid.UUID, *, lock: bool = False) -> Prescription | None:
    stmt = select(Prescription).where(Prescription.visit_id == visit_id, Prescription.status != "Cancelled")
    return db.scalar(stmt.with_for_update() if lock else stmt)


def _patient_context(db: Session, visit: Visit) -> dict:
    p = db.get(Patient, visit.patient_id)
    mh = p.medical_history or {}
    return {"chronic_conditions": mh.get("chronic_conditions", []), "medical_notes": mh.get("notes"),
            "allergy_notes": p.allergy_notes}


def prescription_view(db: Session, visit_id: uuid.UUID) -> dict:
    visit = queue_service.get_visit(db, visit_id)
    rx = _active_rx(db, visit_id)
    out = {"prescription_id": None, "visit_id": visit_id, "status": None, "confirmed_at": None, "items": [],
           "patient_context": _patient_context(db, visit)}
    if rx is None:
        return out
    rows = db.execute(select(PrescriptionItem, Drug).join(Drug, Drug.drug_id == PrescriptionItem.drug_id)
                      .where(PrescriptionItem.prescription_id == rx.prescription_id)
                      .order_by(Drug.generic_name, PrescriptionItem.item_id)).all()
    items = []
    for item, drug in rows:
        d = {k: getattr(item, k) for k in ("item_id", "drug_id", "dosage", "frequency", "duration_days",
                                           "quantity", "instruction", "dispense_status", "skip_reason")}
        d.update(drug_name=invoice_service.drug_label(drug), unit=drug.unit, unit_price=drug.sale_price)
        if rx.status == "Draft":
            d["usable_quantity"] = inventory_service.eligible_quantity(db, item.drug_id, item.duration_days)
        items.append(d)
    out.update(prescription_id=rx.prescription_id, status=rx.status, confirmed_at=rx.confirmed_at, items=items)
    return out


def save_draft(db: Session, visit_id: uuid.UUID, data: PrescriptionDraft, actor: User) -> None:
    _examining_visit(db, visit_id, actor)
    drug_ids = [i.drug_id for i in data.items]
    dup = {d for d in drug_ids if drug_ids.count(d) > 1}
    if dup:
        raise AppError(422, "DUPLICATE_DRUG_IN_PRESCRIPTION", "Mỗi thuốc chỉ kê một dòng",
                       [{"field": f"items.{n}.drug_id", "in": "body", "message": "Trùng thuốc"}
                        for n, d in enumerate(drug_ids) if d in dup])
    drugs = {d.drug_id: d for d in db.scalars(select(Drug).where(Drug.drug_id.in_(drug_ids)))}
    bad = [{"field": f"items.{n}.drug_id", "in": "body",
            "message": "Không có thuốc này" if d not in drugs else "Thuốc đã ngừng dùng"}
           for n, d in enumerate(drug_ids) if d not in drugs or not drugs[d].is_active]
    if bad:
        raise AppError(422, "INVALID_DRUG", "Có thuốc không kê được", bad)

    old = _active_rx(db, visit_id, lock=True)
    if old is not None:
        if old.status != "Draft":
            raise AppError(409, "PRESCRIPTION_CONFIRMED", "Đơn đã xác nhận; mở lại đơn trước khi sửa")
        old.status, old.cancelled_at = "Cancelled", func.now()      # giữ đơn nháp cũ làm lịch sử
        db.flush()
    rx = Prescription(visit_id=visit_id, physician_id=actor.user_id)
    db.add(rx)
    db.flush()
    for i in data.items:
        db.add(PrescriptionItem(prescription_id=rx.prescription_id, **i.model_dump()))
    db.flush()
    audit.record(db, action="CREATE" if old is None else "UPDATE", entity="prescription",
                 entity_id=rx.prescription_id, actor_id=actor.user_id,
                 new_values={"visit_id": str(visit_id), "status": "Draft", "items": len(data.items),
                             **({"replaces": str(old.prescription_id)} if old else {})})


def confirm(db: Session, visit_id: uuid.UUID, actor: User):
    visit = _examining_visit(db, visit_id, actor)
    rx = _active_rx(db, visit_id, lock=True)
    if rx is None or rx.status != "Draft":
        raise AppError(409, "NO_DRAFT", "Chưa có đơn nháp để xác nhận")
    items = list(db.scalars(select(PrescriptionItem).where(PrescriptionItem.prescription_id == rx.prescription_id)))
    inactive = db.scalars(select(Drug.drug_id).where(Drug.drug_id.in_([i.drug_id for i in items]),
                                                    Drug.is_active.is_(False))).all()
    if inactive:
        raise AppError(422, "INVALID_DRUG", "Có thuốc đã ngừng dùng trong đơn",
                       [{"drug_id": str(d)} for d in inactive])
    # mark_prescribed kiểm tra chẩn đoán TRƯỚC khi đụng kho
    if not db.scalar(select(Diagnosis.diagnosis_id).where(Diagnosis.visit_id == visit_id,
                                                          Diagnosis.confirmed_by_physician.is_(True)).limit(1)):
        raise AppError(409, "DIAGNOSIS_REQUIRED", "Cần xác nhận ít nhất một chẩn đoán trước khi kết thúc khám")

    allocations, shortages = inventory_service.allocate_fefo(db, items)
    if shortages:
        raise AppError(409, "STOCK_SHORTAGE", "Không đủ thuốc đủ hạn dùng cho liệu trình", shortages)
    inventory_service.deduct(db, allocations, actor)
    rx.status, rx.confirmed_at = "Confirmed", func.now()
    db.flush()
    audit.record(db, action="UPDATE", entity="prescription", entity_id=rx.prescription_id, actor_id=actor.user_id,
                 old_values={"status": "Draft"},
                 new_values={"status": "Confirmed", "items": len(items), "batches_used": len(allocations)})
    queue_service.mark_prescribed(db, visit_id, actor)
    return invoice_service.create_for_visit(db, visit, actor)


def complete_without_prescription(db: Session, visit_id: uuid.UUID, actor: User):
    visit = _examining_visit(db, visit_id, actor)
    if _active_rx(db, visit_id) is not None:
        raise AppError(409, "PRESCRIPTION_DRAFT_EXISTS", "Đang có đơn nháp: xác nhận đơn hoặc hủy đơn nháp trước")
    queue_service.mark_prescribed(db, visit_id, actor)
    return invoice_service.create_for_visit(db, visit, actor)


def discard_draft(db: Session, visit_id: uuid.UUID, actor: User) -> None:
    _examining_visit(db, visit_id, actor)
    rx = _active_rx(db, visit_id, lock=True)
    if rx is None or rx.status != "Draft":
        raise AppError(409, "NO_DRAFT", "Không có đơn nháp")
    rx.status, rx.cancelled_at = "Cancelled", func.now()
    db.flush()
    audit.record(db, action="UPDATE", entity="prescription", entity_id=rx.prescription_id, actor_id=actor.user_id,
                 old_values={"status": "Draft"}, new_values={"status": "Cancelled"})


def reopen(db: Session, visit_id: uuid.UUID, reason: str, actor: User) -> None:
    """Prescribed -> Examining: chỉ khi CHƯA cấp thuốc nào và hóa đơn CHƯA thu tiền."""
    visit = db.scalar(select(Visit).where(Visit.visit_id == visit_id).with_for_update())
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    if visit.status != "Prescribed" or visit.physician_id != actor.user_id:
        raise AppError(409, "CANNOT_REOPEN", "Chỉ bác sĩ đã khám mở lại được lượt khám đang chờ thu tiền",
                       [{"current": visit.status}])
    invoice = invoice_service.active_invoice(db, visit_id, for_update=True)
    if invoice is not None and invoice.payment_status == "Paid":
        raise AppError(409, "ALREADY_PAID", "Hóa đơn đã thu tiền, không mở lại được")
    rx = _active_rx(db, visit_id, lock=True)
    restored = 0
    if rx is not None:
        items = list(db.scalars(select(PrescriptionItem).where(
            PrescriptionItem.prescription_id == rx.prescription_id).with_for_update()))
        if any(i.dispense_status != "Pending" for i in items):
            raise AppError(409, "ALREADY_DISPENSED", "Đã bắt đầu cấp phát thuốc, không mở lại được")
        for i in items:
            restored += inventory_service.restore_item(db, i.item_id, actor, note="Mở lại đơn")
        rx.status, rx.cancelled_at = "Cancelled", func.now()
        db.flush()
        audit.record(db, action="UPDATE", entity="prescription", entity_id=rx.prescription_id,
                     actor_id=actor.user_id, old_values={"status": "Confirmed"},
                     new_values={"status": "Cancelled", "restored_quantity": restored, "reason": reason})
    if invoice is not None:
        invoice_service.cancel(db, invoice, f"Bác sĩ mở lại đơn: {reason}", actor)
    queue_service.reopen_exam(db, visit_id, actor)
