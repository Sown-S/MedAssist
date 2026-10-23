"""Cấp phát thuốc và thu tiền (US03, US06): Nurse thao tác; Physician, Nurse xem hóa đơn."""
import datetime
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.audit_view import CLINICAL_ROLES, DEFAULT_POLL_WINDOW, audit_view
from app.core.auth import require_roles
from app.core.database import get_db
from app.models import User
from app.schemas.invoice import (AwaitingPaymentItem, BillingResult, DispenseRequest, InvoiceEdit,
                                 InvoiceHistoryItem, InvoiceOut, InvoicePrint, PaymentRequest)
from app.services import billing_service, invoice_service

router = APIRouter(tags=["billing"])

_nurse_rx = require_roles("Nurse", audit_entity="prescription_item")
_nurse_invoice = require_roles("Nurse", audit_entity="invoice")


def _result(db: Session, visit_id: uuid.UUID, finished: bool) -> BillingResult:
    inv = invoice_service.active_invoice(db, visit_id)
    return BillingResult(visit_finished=finished, invoice=invoice_service.to_out(db, inv) if inv else None)


@router.get("/billing/awaiting", response_model=list[AwaitingPaymentItem])
def awaiting(_: User = Depends(audit_view("visit", roles=("Nurse",), dedupe_seconds=DEFAULT_POLL_WINDOW)),
             db: Session = Depends(get_db)):
    """Lượt khám đang chờ cấp phát / thu tiền (Prescribed), cũ nhất trước."""
    return billing_service.awaiting_payment(db)


@router.get("/billing/invoices", response_model=list[InvoiceHistoryItem])
def invoice_history(date: datetime.date | None = None, include_cancelled: bool = False,
                    _: User = Depends(audit_view("invoice", roles=("Nurse",), dedupe_seconds=DEFAULT_POLL_WINDOW)),
                    db: Session = Depends(get_db)):
    """Lịch sử hóa đơn trong ngày (mặc định hôm nay). Hóa đơn bị hủy do sửa chỉ hiện khi include_cancelled."""
    return billing_service.invoice_history(db, date, include_cancelled)


@router.get("/visits/{visit_id}/invoice", response_model=InvoiceOut)
def get_invoice(visit_id: uuid.UUID,
                _: User = Depends(audit_view("visit", roles=CLINICAL_ROLES, id_param="visit_id")),
                db: Session = Depends(get_db)):
    """Hóa đơn chưa hủy của lượt khám (Pending hoặc Paid)."""
    return invoice_service.to_out(db, invoice_service.current_for_visit(db, visit_id))


@router.get("/visits/{visit_id}/invoice/print", response_model=InvoicePrint)
def print_invoice(visit_id: uuid.UUID,
                  _: User = Depends(audit_view("visit", roles=CLINICAL_ROLES, id_param="visit_id")),
                  db: Session = Depends(get_db)):
    """Dữ liệu in phiếu thu: thông tin phòng khám (clinic.profile), bệnh nhân, hóa đơn. Client lo phần in."""
    return billing_service.print_data(db, visit_id)


@router.patch("/visits/{visit_id}/invoice", response_model=InvoiceOut)
def edit_invoice(visit_id: uuid.UUID, body: InvoiceEdit, actor: User = Depends(_nurse_invoice),
                 db: Session = Depends(get_db)):
    """Sửa hóa đơn Pending: hủy hóa đơn cũ, lập hóa đơn mới (mã mới). Dòng thuốc luôn lấy theo đơn."""
    paraclinical = None if body.paraclinical_items is None else [p.model_dump() for p in body.paraclinical_items]
    invoice = billing_service.edit_invoice(db, visit_id, body.consultation_fee, paraclinical, actor)
    db.commit()
    return invoice_service.to_out(db, invoice)


@router.post("/visits/{visit_id}/invoice/pay", response_model=BillingResult)
def pay(visit_id: uuid.UUID, body: PaymentRequest, actor: User = Depends(_nurse_invoice),
        db: Session = Depends(get_db)):
    """Thu tiền. Nếu mọi dòng thuốc đã cấp/bỏ qua (hoặc không có đơn) thì lượt khám chuyển Finished."""
    _, finished = billing_service.pay(db, visit_id, body.payment_method, actor)
    db.commit()
    return _result(db, visit_id, finished)


@router.patch("/prescription-items/{item_id}/dispense", response_model=BillingResult)
def dispense(item_id: uuid.UUID, body: DispenseRequest, actor: User = Depends(_nurse_rx),
             db: Session = Depends(get_db)):
    """Cấp (Dispensed) hoặc bỏ qua (Skipped, cần lý do: hoàn kho + lập lại hóa đơn) một dòng thuốc."""
    from app.models import Prescription, PrescriptionItem
    finished = billing_service.dispense_item(db, item_id, body.action, body.skip_reason, actor)
    db.commit()
    visit_id = db.get(Prescription, db.get(PrescriptionItem, item_id).prescription_id).visit_id
    return _result(db, visit_id, finished)


@router.post("/visits/{visit_id}/dispense-all", response_model=BillingResult)
def dispense_all(visit_id: uuid.UUID, actor: User = Depends(_nurse_rx), db: Session = Depends(get_db)):
    """Cấp tất cả các dòng thuốc còn chờ."""
    finished = billing_service.dispense_all(db, visit_id, actor)
    db.commit()
    return _result(db, visit_id, finished)
