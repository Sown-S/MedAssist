"""Hóa đơn (US06). Lượt 6b: tự tạo hóa đơn Pending khi lượt khám sang Prescribed, hủy khi mở lại đơn.
Lượt 6c: sửa phí khám / dòng nhập tay, lập lại khi bỏ qua thuốc, thu tiền, Finished.
ERD v2.1: dòng cận lâm sàng lấy từ phiếu chỉ định, phí khám lấy từ danh mục dịch vụ.

Bất biến do CSDL giữ: total = 3 khoản phí; mỗi khoản phí = tổng các dòng cùng loại (constraint trigger,
kiểm ở cuối transaction); dòng thuốc thuộc đơn của CÙNG lượt khám; tối đa một hóa đơn chưa hủy / lượt.
Không xóa dòng hóa đơn (app không có quyền DELETE): sửa = hủy hóa đơn rồi lập hóa đơn mới.
"""
import uuid
from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.exceptions import NotFoundError
from app.models import Drug, Invoice, InvoiceItem, Prescription, PrescriptionItem, Service, User, Visit
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


def default_consultation(db: Session, package_name: str | None) -> tuple[str, Decimal]:
    """Phí khám: 0 nếu gói đã chỉ định có dịch vụ khám; không thì theo dịch vụ ở
    billing.consultation_service_code, thiếu dịch vụ đó thì theo billing.default_consultation_fee."""
    from app.services.settings_service import get_value
    if package_name:
        return f"{CONSULTATION_NAME} (trong gói {package_name})"[:150], Decimal(0)
    code = get_value(db, "billing.consultation_service_code")
    service = db.scalar(select(Service).where(Service.code == code, Service.is_active.is_(True))) if code else None
    if service is not None:
        return service.name, service.price
    return CONSULTATION_NAME, Decimal(get_value(db, "billing.default_consultation_fee"))


def create_for_visit(db: Session, visit: Visit, actor: User, *, consultation_fee: Decimal | None = None,
                     consultation_name: str | None = None, extra_lines: list[dict] | None = None) -> Invoice:
    """Lập hóa đơn Pending: một dòng phí khám + một dòng cho mỗi thuốc chưa bị bỏ qua của đơn
    Confirmed (nếu có) + dòng cận lâm sàng từ phiếu chỉ định + các dòng nhập tay truyền vào."""
    from app.services import service_order_service   # import vòng: service_order_service lập lại hóa đơn
    ordered, package_name = service_order_service.billable(db, visit.visit_id)
    if consultation_fee is None:
        consultation_name, consultation_fee = default_consultation(db, package_name)
    lines = [dict(item_type="Consultation", item_name=consultation_name or CONSULTATION_NAME, quantity=1,
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
    lines += ordered + (extra_lines or [])

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
    from app.services import service_order_service
    return {**{c: getattr(invoice, c) for c in (
        "invoice_id", "visit_id", "invoice_code", "consultation_fee", "paraclinical_fee", "drug_fee",
        "total_amount", "payment_method", "payment_status", "paid_at", "cancelled_at", "cancel_reason",
        "created_at")}, "items": items, "unbilled_items": service_order_service.unbilled(db, invoice.visit_id)}


def current_for_visit(db: Session, visit_id: uuid.UUID) -> Invoice:
    invoice = active_invoice(db, visit_id)
    if invoice is None:
        raise NotFoundError("Lượt khám chưa có hóa đơn")
    return invoice


# ============================================================================ Lượt 6c: sửa, lập lại, thu tiền
def _paraclinical_lines(db: Session, invoice: Invoice) -> list[dict]:
    """Chỉ dòng nhập tay; dòng từ phiếu chỉ định được lập lại theo chỉ định còn hiệu lực."""
    return [dict(item_type="Paraclinical", item_name=i.item_name, quantity=i.quantity, unit_price=i.unit_price,
                 prescription_item_id=None)
            for i in db.scalars(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.invoice_id,
                                                          InvoiceItem.item_type == "Paraclinical",
                                                          InvoiceItem.service_order_id.is_(None))
                                .order_by(InvoiceItem.item_name))]


def _consultation_name(db: Session, invoice: Invoice) -> str | None:
    return db.scalar(select(InvoiceItem.item_name).where(InvoiceItem.invoice_id == invoice.invoice_id,
                                                         InvoiceItem.item_type == "Consultation").limit(1))


def reissue(db: Session, visit: Visit, old: Invoice, reason: str, actor: User, *,
            consultation_fee: Decimal | None = None, consultation_name: str | None = None,
            paraclinical: list[dict] | None = None) -> Invoice:
    """Hủy hóa đơn Pending cũ và lập hóa đơn mới (app không có quyền DELETE dòng hóa đơn).
    Mặc định giữ nguyên dòng phí khám và các dòng nhập tay; dòng thuốc lập lại theo đơn (bỏ dòng Skipped),
    dòng cận lâm sàng lập lại theo phiếu chỉ định."""
    keep_fee = old.consultation_fee if consultation_fee is None else consultation_fee
    keep_name = consultation_name or _consultation_name(db, old)
    keep_para = _paraclinical_lines(db, old) if paraclinical is None else paraclinical
    method = old.payment_method
    cancel(db, old, reason, actor)
    new = create_for_visit(db, visit, actor, consultation_fee=keep_fee, consultation_name=keep_name,
                           extra_lines=keep_para)
    new.payment_method = method
    db.flush()
    return new
