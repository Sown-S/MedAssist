"""Hóa đơn và cấp phát (US06). Lượt 6b: xem hóa đơn hiện tại. Lượt 6c: sửa, thu tiền, cấp phát."""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.audit_view import CLINICAL_ROLES, audit_view
from app.core.database import get_db
from app.models import User
from app.schemas.invoice import InvoiceOut
from app.services import invoice_service

router = APIRouter(tags=["billing"])


@router.get("/visits/{visit_id}/invoice", response_model=InvoiceOut)
def get_invoice(visit_id: uuid.UUID,
                _: User = Depends(audit_view("visit", roles=CLINICAL_ROLES, id_param="visit_id")),
                db: Session = Depends(get_db)):
    """Hóa đơn chưa hủy của lượt khám (Pending hoặc Paid)."""
    return invoice_service.to_out(db, invoice_service.current_for_visit(db, visit_id))
