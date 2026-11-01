"""Chẩn đoán (US02) và kê đơn (US03): Physician đang khám lượt đó thao tác; Physician, Nurse xem."""
import datetime
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.audit_view import CLINICAL_ROLES, DEFAULT_POLL_WINDOW, audit_view
from app.core.auth import require_roles
from app.core.database import get_db
from app.models import User
from app.schemas.diagnosis import DiagnosisCreate, DiagnosisOut, DiagnosisUpdate
from app.schemas.invoice import InvoiceOut
from app.schemas.prescription import PrescriptionDraft, PrescriptionListItem, PrescriptionOut, ReopenRequest
from app.services import invoice_service, prescription_service as rx

router = APIRouter(tags=["prescription"])

_physician_dx = require_roles("Physician", audit_entity="diagnosis")
_physician_rx = require_roles("Physician", audit_entity="prescription")
_view_visit = audit_view("visit", roles=CLINICAL_ROLES, id_param="visit_id")


# ============================================================================ Chẩn đoán
@router.get("/visits/{visit_id}/diagnoses", response_model=list[DiagnosisOut])
def list_diagnoses(visit_id: uuid.UUID, _: User = Depends(_view_visit), db: Session = Depends(get_db)):
    return rx.list_diagnoses(db, visit_id)


@router.post("/visits/{visit_id}/diagnoses", response_model=DiagnosisOut, status_code=201)
def add_diagnosis(visit_id: uuid.UUID, body: DiagnosisCreate, actor: User = Depends(_physician_dx),
                  db: Session = Depends(get_db)):
    """Lưu = xác nhận. Chẩn đoán đầu tiên luôn là chẩn đoán chính; thêm một chẩn đoán chính mới thì
    chẩn đoán chính cũ thành chẩn đoán kèm theo. Gắn với lần chạy AI (assessment_id, không bắt buộc)
    và ghi quyết định của bác sĩ vào nhật ký AI trong cùng transaction."""
    dx = rx.add_diagnosis(db, visit_id, body, actor)
    db.commit()
    return dx


@router.patch("/diagnoses/{diagnosis_id}", response_model=DiagnosisOut)
def update_diagnosis(diagnosis_id: uuid.UUID, body: DiagnosisUpdate, actor: User = Depends(_physician_dx),
                     db: Session = Depends(get_db)):
    dx = rx.update_diagnosis(db, diagnosis_id, body, actor)
    db.commit()
    return dx


@router.post("/diagnoses/{diagnosis_id}/retract", response_model=DiagnosisOut)
def retract_diagnosis(diagnosis_id: uuid.UUID, actor: User = Depends(_physician_dx), db: Session = Depends(get_db)):
    """Rút lại chẩn đoán nhập nhầm (không xóa, giữ vết)."""
    dx = rx.retract_diagnosis(db, diagnosis_id, actor)
    db.commit()
    return dx


# ============================================================================ Đơn thuốc
@router.get("/visits/{visit_id}/prescription", response_model=PrescriptionOut)
def get_prescription(visit_id: uuid.UUID, _: User = Depends(_view_visit), db: Session = Depends(get_db)):
    """Đơn hiện tại (nháp hoặc đã xác nhận) + khung nhắc bệnh nền / dị ứng (chỉ đọc)."""
    return rx.prescription_view(db, visit_id)


@router.put("/visits/{visit_id}/prescription", response_model=PrescriptionOut)
def save_draft(visit_id: uuid.UUID, body: PrescriptionDraft, actor: User = Depends(_physician_rx),
               db: Session = Depends(get_db)):
    """Ghi đè toàn bộ đơn nháp. Kho chưa bị trừ cho tới khi xác nhận."""
    rx.save_draft(db, visit_id, body, actor)
    db.commit()
    return rx.prescription_view(db, visit_id)


@router.delete("/visits/{visit_id}/prescription", status_code=status.HTTP_204_NO_CONTENT)
def discard_draft(visit_id: uuid.UUID, actor: User = Depends(_physician_rx), db: Session = Depends(get_db)) -> None:
    """Bỏ đơn nháp (đánh dấu Cancelled, không xóa dữ liệu)."""
    rx.discard_draft(db, visit_id, actor)
    db.commit()


@router.post("/visits/{visit_id}/prescription/confirm", response_model=InvoiceOut)
def confirm(visit_id: uuid.UUID, actor: User = Depends(_physician_rx), db: Session = Depends(get_db)):
    """Xác nhận đơn: trừ kho FEFO, lượt khám -> Prescribed, lập hóa đơn Pending. Trả hóa đơn.
    Thiếu thuốc: 409 STOCK_SHORTAGE (details: từng dòng, lý do), không trừ gì."""
    invoice = rx.confirm(db, visit_id, actor)
    db.commit()
    return invoice_service.to_out(db, invoice)


@router.post("/visits/{visit_id}/complete-exam", response_model=InvoiceOut)
def complete_exam(visit_id: uuid.UUID, actor: User = Depends(_physician_rx), db: Session = Depends(get_db)):
    """Hoàn tất khám KHÔNG kê đơn: lượt khám -> Prescribed (chờ thu tiền), hóa đơn chỉ có phí khám."""
    invoice = rx.complete_without_prescription(db, visit_id, actor)
    db.commit()
    return invoice_service.to_out(db, invoice)


@router.post("/visits/{visit_id}/prescription/reopen", status_code=status.HTTP_204_NO_CONTENT)
def reopen(visit_id: uuid.UUID, body: ReopenRequest, actor: User = Depends(_physician_rx),
           db: Session = Depends(get_db)) -> None:
    """Mở lại đơn (chưa cấp thuốc, chưa thu tiền): hoàn kho, hủy đơn và hóa đơn, lượt khám về Examining."""
    rx.reopen(db, visit_id, body.reason, actor)
    db.commit()


@router.get("/prescriptions", response_model=list[PrescriptionListItem])
def list_prescriptions(date_from: datetime.date | None = None, date_to: datetime.date | None = None,
                       physician_id: uuid.UUID | None = None,
                       _: User = Depends(audit_view("prescription", roles=CLINICAL_ROLES,
                                                    dedupe_seconds=DEFAULT_POLL_WINDOW)),
                       db: Session = Depends(get_db)):
    """Đơn đã xác nhận theo ngày xác nhận (mặc định hôm nay), lọc theo bác sĩ; tối đa 500 đơn."""
    return rx.list_confirmed(db, date_from, date_to, physician_id)
