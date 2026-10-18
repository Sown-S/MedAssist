"""Cấp phát thuốc và thu tiền (US03, US06) — lượt 6c. Nurse thao tác khi lượt khám ở Prescribed.

  * Cấp phát từng dòng: Dispensed, hoặc Skipped (bắt buộc lý do) -> hoàn kho đúng các lô đã trừ và
    LẬP LẠI hóa đơn Pending (bỏ dòng thuốc đó). Sau khi đã thu tiền: chỉ được Dispensed.
  * Sửa hóa đơn Pending (phí khám, dòng cận lâm sàng nhập tay) = hủy và lập lại.
  * Thu tiền: Pending -> Paid (Tiền mặt / Chuyển khoản). Paid là chốt cuối.
  * Lượt khám tự Finished khi hóa đơn Paid VÀ không còn dòng thuốc Pending (đơn -> Dispensed).
  * Hủy lượt khám ở Prescribed (bệnh nhân bỏ về): chỉ khi chưa cấp thuốc nào, chưa thu tiền.
"""
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.exceptions import AppError, NotFoundError
from app.models import Invoice, Patient, Prescription, PrescriptionItem, User, Visit
from app.schemas.patient import patient_code
from app.services import audit_service as audit
from app.services import inventory_service, invoice_service, queue_service


def _prescribed_visit(db: Session, visit_id: uuid.UUID) -> Visit:
    visit = db.scalar(select(Visit).where(Visit.visit_id == visit_id).with_for_update())
    if visit is None:
        raise NotFoundError("Không tìm thấy lượt khám")
    if visit.status != "Prescribed":
        raise AppError(409, "VISIT_NOT_AWAITING_PAYMENT", "Lượt khám không ở bước cấp phát / thu tiền",
                       [{"current": visit.status}])
    return visit


def _confirmed_rx(db: Session, visit_id: uuid.UUID) -> Prescription | None:
    return db.scalar(select(Prescription).where(Prescription.visit_id == visit_id,
                                                Prescription.status.in_(("Confirmed", "Dispensed")))
                     .with_for_update())


def _pending_items(db: Session, rx: Prescription | None) -> int:
    if rx is None:
        return 0
    return db.scalar(select(func.count()).select_from(PrescriptionItem).where(
        PrescriptionItem.prescription_id == rx.prescription_id, PrescriptionItem.dispense_status == "Pending")) or 0


def _maybe_finish(db: Session, visit: Visit, actor: User) -> bool:
    """Paid + không còn dòng Pending -> đơn Dispensed, lượt khám Finished (cùng transaction)."""
    invoice = invoice_service.active_invoice(db, visit.visit_id)
    rx = _confirmed_rx(db, visit.visit_id)
    if invoice is None or invoice.payment_status != "Paid" or _pending_items(db, rx):
        return False
    if rx is not None and rx.status == "Confirmed":
        rx.status = "Dispensed"
        db.flush()
    queue_service.mark_finished(db, visit.visit_id, actor)
    return True


# ---------------------------------------------------------------------------- cấp phát
def dispense_item(db: Session, item_id: uuid.UUID, action: str, skip_reason: str | None, actor: User) -> bool:
    item = db.scalar(select(PrescriptionItem).where(PrescriptionItem.item_id == item_id).with_for_update())
    if item is None:
        raise NotFoundError("Không tìm thấy dòng thuốc")
    rx = db.get(Prescription, item.prescription_id)
    visit = _prescribed_visit(db, rx.visit_id)
    if rx.status != "Confirmed":
        raise AppError(409, "PRESCRIPTION_NOT_CONFIRMED", "Đơn thuốc không ở trạng thái chờ cấp phát")
    if item.dispense_status != "Pending":
        raise AppError(409, "ALREADY_PROCESSED", f"Dòng thuốc đã được xử lý ({item.dispense_status})")
    invoice = invoice_service.active_invoice(db, visit.visit_id, for_update=True)

    if action == "Skipped":
        if not skip_reason:
            raise AppError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ",
                           [{"field": "skip_reason", "in": "body", "message": "Bỏ qua thuốc phải ghi lý do"}])
        if invoice is not None and invoice.payment_status == "Paid":
            raise AppError(409, "ALREADY_PAID", "Hóa đơn đã thu tiền: không bỏ qua thuốc được (cần hoàn tiền)")
        item.dispense_status, item.skip_reason = "Skipped", skip_reason
        restored = inventory_service.restore_item(db, item.item_id, actor, note=f"Bỏ qua khi cấp phát: {skip_reason}")
        db.flush()
        if invoice is not None:
            invoice_service.reissue(db, visit, invoice, "Dòng thuốc bị bỏ qua khi cấp phát", actor)
        extra = {"restored_quantity": restored}
    else:
        item.dispense_status = "Dispensed"
        extra = {}
    item.dispensed_by, item.dispensed_at = actor.user_id, func.now()
    db.flush()
    audit.record(db, action="UPDATE", entity="prescription_item", entity_id=item.item_id, actor_id=actor.user_id,
                 old_values={"dispense_status": "Pending"}, new_values={"dispense_status": action, **extra})
    return _maybe_finish(db, visit, actor)


def dispense_all(db: Session, visit_id: uuid.UUID, actor: User) -> bool:
    _prescribed_visit(db, visit_id)
    rx = _confirmed_rx(db, visit_id)
    if rx is None or rx.status != "Confirmed":
        raise AppError(409, "PRESCRIPTION_NOT_CONFIRMED", "Không có đơn thuốc chờ cấp phát")
    ids = db.scalars(select(PrescriptionItem.item_id).where(
        PrescriptionItem.prescription_id == rx.prescription_id, PrescriptionItem.dispense_status == "Pending")).all()
    if not ids:
        raise AppError(409, "NOTHING_TO_DISPENSE", "Không còn dòng thuốc chờ cấp phát")
    finished = False
    for i in ids:
        finished = dispense_item(db, i, "Dispensed", None, actor)
    return finished


# ---------------------------------------------------------------------------- hóa đơn
def edit_invoice(db: Session, visit_id: uuid.UUID, consultation_fee: Decimal | None,
                 paraclinical: list[dict] | None, actor: User) -> Invoice:
    visit = _prescribed_visit(db, visit_id)
    invoice = invoice_service.active_invoice(db, visit_id, for_update=True)
    if invoice is None:
        raise NotFoundError("Lượt khám chưa có hóa đơn")
    if invoice.payment_status != "Pending":
        raise AppError(409, "ALREADY_PAID", "Hóa đơn đã thu tiền, không sửa được")
    lines = None if paraclinical is None else [
        dict(item_type="Paraclinical", item_name=p["item_name"], quantity=p["quantity"],
             unit_price=p["unit_price"], prescription_item_id=None) for p in paraclinical]
    return invoice_service.reissue(db, visit, invoice, "Sửa hóa đơn", actor,
                                   consultation_fee=consultation_fee, paraclinical=lines)


def pay(db: Session, visit_id: uuid.UUID, method: str, actor: User) -> tuple[Invoice, bool]:
    visit = _prescribed_visit(db, visit_id)
    invoice = invoice_service.active_invoice(db, visit_id, for_update=True)
    if invoice is None:
        raise NotFoundError("Lượt khám chưa có hóa đơn")
    if invoice.payment_status != "Pending":
        raise AppError(409, "ALREADY_PAID", "Hóa đơn đã thu tiền")
    invoice.payment_status, invoice.payment_method, invoice.paid_at = "Paid", method, func.now()
    db.flush()
    audit.record(db, action="UPDATE", entity="invoice", entity_id=invoice.invoice_id, actor_id=actor.user_id,
                 old_values={"payment_status": "Pending"},
                 new_values={"payment_status": "Paid", "payment_method": method, "total_amount": invoice.total_amount})
    return invoice, _maybe_finish(db, visit, actor)


# ---------------------------------------------------------------------------- hủy lượt khám ở Prescribed
def cancel_prescribed(db: Session, visit_id: uuid.UUID, reason: str, actor: User) -> Visit:
    """Bệnh nhân bỏ về: chưa cấp thuốc nào, chưa thu tiền -> hoàn kho, hủy đơn, hủy hóa đơn, hủy lượt."""
    _prescribed_visit(db, visit_id)
    invoice = invoice_service.active_invoice(db, visit_id, for_update=True)
    if invoice is not None and invoice.payment_status == "Paid":
        raise AppError(409, "ALREADY_PAID", "Hóa đơn đã thu tiền, không hủy lượt khám được")
    rx = _confirmed_rx(db, visit_id)
    if rx is not None:
        items = list(db.scalars(select(PrescriptionItem).where(
            PrescriptionItem.prescription_id == rx.prescription_id).with_for_update()))
        if any(i.dispense_status == "Dispensed" for i in items):
            raise AppError(409, "ALREADY_DISPENSED", "Đã cấp thuốc: bỏ qua phần còn lại và thu tiền phần đã cấp")
        for i in items:
            if i.dispense_status == "Pending":
                inventory_service.restore_item(db, i.item_id, actor, note=f"Hủy lượt khám: {reason}")
        rx.status, rx.cancelled_at = "Cancelled", func.now()
        db.flush()
        audit.record(db, action="UPDATE", entity="prescription", entity_id=rx.prescription_id,
                     actor_id=actor.user_id, old_values={"status": "Confirmed"},
                     new_values={"status": "Cancelled", "reason": reason})
    if invoice is not None:
        invoice_service.cancel(db, invoice, f"Hủy lượt khám: {reason}", actor)
    return queue_service.cancel_from_prescribed(db, visit_id, reason, actor)


# ---------------------------------------------------------------------------- danh sách chờ thu tiền, in phiếu
def awaiting_payment(db: Session) -> list[dict]:
    rows = db.execute(
        select(Visit, Patient.full_name, Invoice)
        .join(Patient, Patient.patient_id == Visit.patient_id)
        .outerjoin(Invoice, (Invoice.visit_id == Visit.visit_id) & (Invoice.payment_status != "Cancelled"))
        .where(Visit.status == "Prescribed").order_by(Visit.updated_at)).all()
    out = []
    for v, name, inv in rows:
        rx = db.scalar(select(Prescription).where(Prescription.visit_id == v.visit_id,
                                                  Prescription.status.in_(("Confirmed", "Dispensed"))))
        pending = _pending_items(db, rx)
        out.append({"visit_id": v.visit_id, "queue_number": v.queue_number, "patient_name": name,
                    "invoice_code": inv.invoice_code if inv else None,
                    "total_amount": inv.total_amount if inv else None,
                    "payment_status": inv.payment_status if inv else None,
                    "has_prescription": rx is not None, "pending_items": pending})
    return out


def print_data(db: Session, visit_id: uuid.UUID) -> dict:
    from app.models import User as U
    from app.services.settings_service import get_value
    visit = queue_service.get_visit(db, visit_id)
    invoice = invoice_service.current_for_visit(db, visit_id)
    patient = db.get(Patient, visit.patient_id)
    physician = db.get(U, visit.physician_id) if visit.physician_id else None
    return {"clinic": get_value(db, "clinic.profile"),
            "patient": {"patient_code": patient_code(patient.patient_id), "full_name": patient.full_name, "date_of_birth": patient.date_of_birth,
                        "gender": patient.gender},
            "physician_name": physician.full_name if physician else None,
            "visit_date": visit.visit_date, "invoice": invoice_service.to_out(db, invoice)}
