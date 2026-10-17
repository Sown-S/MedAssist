"""Hóa đơn (US06). Lượt 6b: tự tạo hóa đơn Pending khi lượt khám sang Prescribed, hủy khi mở lại đơn.
Lượt 6c: sửa phí khám / dòng nhập tay, lập lại khi bỏ qua thuốc, thu tiền, Finished.

Bất biến do CSDL giữ: total = 3 khoản phí; mỗi khoản phí = tổng các dòng cùng loại (constraint trigger,
kiểm ở cuối transaction); dòng thuốc thuộc đơn của CÙNG lượt khám; tối đa một hóa đơn chưa hủy / lượt.
Không xóa dòng hóa đơn (app không có quyền DELETE): sửa = hủy hóa đơn rồi lập hóa đơn mới.
"""
import uuid
from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.exceptions import NotFoundError
from app.models import Drug, Invoice, InvoiceItem, Prescription, PrescriptionItem, User, Visit
from app.services import audit_service as audit

_CODE_LOCK_KEY = 4_206_202_611
CONSULTATION_NAME = "Phí khám bệnh"


def drug_label(drug: Drug) -> str:
    return f"{drug.generic_name} {drug.strength} ({drug.trade_name})"[:150]


def _next_code(db: Session) -> str:
    db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _CODE_LOCK_KEY})
    prefix = db.scalar(select(func.concat("HD-", func.to_char(func.current_date(), "YYYYMMDD"), "-")))
    count = db.scalar(select(func.count()).select_from(Invoice).where(Invoice.invoice_code.like(prefix + "%")))
    return f"{prefix}{count + 1:04d}"


def active_invoice(db: Session, visit_id: uuid.UUID, *, for_update: bool = False) -> Invoice | None:
    stmt = select(Invoice).where(Invoice.visit_id == visit_id, Invoice.payment_status != "Cancelled")
    if for_update:
        stmt = stmt.with_for_update()
    return db.scalar(stmt)


def create_for_visit(db: Session, visit: Visit, actor: User, *, consultation_fee: Decimal | None = None,
                     extra_lines: list[dict] | None = None) -> Invoice:
    """Lập hóa đơn Pending: một dòng phí khám + một dòng cho mỗi thuốc chưa bị bỏ qua của đơn
    Confirmed (nếu có) + các dòng nhập tay truyền vào (khi lập lại hóa đơn ở lượt 6c)."""
    if consultation_fee is None:
        from app.services.settings_service import get_value
        consultation_fee = Decimal(get_value(db, "billing.default_consultation_fee"))
    lines = [dict(item_type="Consultation", item_name=CONSULTATION_NAME, quantity=1,
                  unit_price=Decimal(consultation_fee), prescription_item_id=None)]
    rx = db.scalar(select(Prescription).where(Prescription.visit_id == visit.visit_id,
                                              Prescription.status.in_(("Confirmed", "Dispensed"))))
    if rx is not None:
        rows = db.execute(select(PrescriptionItem, Drug).join(Drug, Drug.drug_id == PrescriptionItem.drug_id)
                          .where(PrescriptionItem.prescription_id == rx.prescription_id,
                                 PrescriptionItem.dispense_status != "Skipped")
                          .order_by(Drug.generic_name, PrescriptionItem.item_id)).all()
        for item, drug in rows:
            lines.append(dict(item_type="Drug", item_name=drug_label(drug), quantity=item.quantity,
                              unit_price=drug.sale_price, prescription_item_id=item.item_id))
    lines += extra_lines or []

    fees = {"Consultation": Decimal(0), "Paraclinical": Decimal(0), "Drug": Decimal(0)}
    for ln in lines:
        ln["subtotal"] = Decimal(ln["unit_price"]) * ln["quantity"]
        fees[ln["item_type"]] += ln["subtotal"]
    invoice = Invoice(visit_id=visit.visit_id, issued_by=actor.user_id, invoice_code=_next_code(db),
                      consultation_fee=fees["Consultation"], paraclinical_fee=fees["Paraclinical"],
                      drug_fee=fees["Drug"], total_amount=sum(fees.values()))
    db.add(invoice)
    db.flush()
    for ln in lines:
        db.add(InvoiceItem(invoice_id=invoice.invoice_id, **ln))
    db.flush()
    audit.record(db, action="CREATE", entity="invoice", entity_id=invoice.invoice_id, actor_id=actor.user_id,
                 new_values={"invoice_code": invoice.invoice_code, "visit_id": str(visit.visit_id),
                             "total_amount": invoice.total_amount, "lines": len(lines)})
    return invoice


def cancel(db: Session, invoice: Invoice, reason: str, actor: User) -> None:
    invoice.payment_status = "Cancelled"
    invoice.cancelled_at = func.now()
    invoice.cancel_reason = reason
    db.flush()
    audit.record(db, action="UPDATE", entity="invoice", entity_id=invoice.invoice_id, actor_id=actor.user_id,
                 old_values={"payment_status": "Pending"},
                 new_values={"payment_status": "Cancelled", "reason": reason})


def to_out(db: Session, invoice: Invoice) -> dict:
    items = db.scalars(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.invoice_id)
                       .order_by(InvoiceItem.item_type, InvoiceItem.item_name)).all()
    db.refresh(invoice)
    return {**{c: getattr(invoice, c) for c in (
        "invoice_id", "visit_id", "invoice_code", "consultation_fee", "paraclinical_fee", "drug_fee",
        "total_amount", "payment_method", "payment_status", "paid_at", "cancelled_at", "cancel_reason",
        "created_at")}, "items": items}


def current_for_visit(db: Session, visit_id: uuid.UUID) -> Invoice:
    invoice = active_invoice(db, visit_id)
    if invoice is None:
        raise NotFoundError("Lượt khám chưa có hóa đơn")
    return invoice
