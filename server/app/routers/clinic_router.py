"""Lâm sàng: bệnh nhân (EMR, US04), lượt khám và hàng đợi (US10).

Quyền: Nurse tạo/sửa bệnh nhân và lượt khám, check-in, hủy khi chưa khám; Physician nhận khám,
trả lại, hủy lượt đang khám của mình; cả hai xem dữ liệu. Admin không truy cập (tài liệu).
Mọi GET dữ liệu bệnh nhân ghi VIEW (audit_view); hàng đợi gộp 1 dòng / 5 phút.
"""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.audit_view import CLINICAL_ROLES, DEFAULT_POLL_WINDOW, audit_view
from app.core.auth import require_roles
from app.core.database import get_db
from app.models import User
from app.schemas.common import Page, PhoneVN
from app.schemas.patient import IdNumber, PatientCreate, PatientOut, PatientSummary, PatientUpdate
from app.schemas.visit import (BulkCancelRequest, CancelRequest, QueueItem, VisitCreate, VisitOut,
                               VisitUpdate, VisitWithWarnings)
from app.services import emr_service, queue_service
from app.validation.schema_validators import vital_sign_warnings

router = APIRouter(tags=["clinic"])

_nurse_patient = require_roles("Nurse", audit_entity="patient")
_nurse_visit = require_roles("Nurse", audit_entity="visit")
_physician_visit = require_roles("Physician", audit_entity="visit")
_clinical_visit = require_roles(*CLINICAL_ROLES, audit_entity="visit")


def _with_warnings(visit) -> VisitWithWarnings:
    out = VisitWithWarnings.model_validate(visit)
    out.warnings = vital_sign_warnings(visit.vital_signs)
    return out


# ============================================================================ Bệnh nhân
@router.get("/patients", response_model=Page[PatientSummary])
def search_patients(
    q: str | None = Query(None, min_length=1, max_length=100, description="Một phần họ tên, gõ có dấu hay không dấu đều được"),
    phone: PhoneVN | None = Query(None), id_number: IdNumber | None = Query(None),
    limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
    _: User = Depends(audit_view("patient", roles=CLINICAL_ROLES)), db: Session = Depends(get_db),
):
    total, rows = emr_service.search_patients(db, q=q, phone=phone, id_number=id_number,
                                              limit=limit, offset=offset)
    return Page[PatientSummary](total=total, limit=limit, offset=offset, items=rows)


@router.post("/patients", response_model=PatientOut, status_code=201)
def create_patient(body: PatientCreate, actor: User = Depends(_nurse_patient), db: Session = Depends(get_db)):
    patient = emr_service.create_patient(db, body, actor)
    db.commit()
    return patient


@router.get("/patients/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: uuid.UUID,
                _: User = Depends(audit_view("patient", roles=CLINICAL_ROLES, id_param="patient_id")),
                db: Session = Depends(get_db)):
    return emr_service.get_patient(db, patient_id)


@router.patch("/patients/{patient_id}", response_model=PatientOut)
def update_patient(patient_id: uuid.UUID, body: PatientUpdate, actor: User = Depends(_nurse_patient),
                   db: Session = Depends(get_db)):
    patient = emr_service.update_patient(db, patient_id, body, actor)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/patients/{patient_id}/visits", response_model=Page[VisitOut])
def patient_visits(patient_id: uuid.UUID, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                   _: User = Depends(audit_view("patient", roles=CLINICAL_ROLES, id_param="patient_id")),
                   db: Session = Depends(get_db)):
    """Lịch sử khám, mới nhất trước (US04)."""
    emr_service.get_patient(db, patient_id)
    total, rows = queue_service.patient_history(db, patient_id, limit, offset)
    return Page[VisitOut](total=total, limit=limit, offset=offset, items=rows)


# ============================================================================ Hàng đợi
@router.get("/queue", response_model=list[QueueItem])
def queue(_: User = Depends(audit_view("visit", roles=CLINICAL_ROLES, dedupe_seconds=DEFAULT_POLL_WINDOW)),
          db: Session = Depends(get_db)):
    """Hàng đợi hôm nay (Waiting, CheckedIn): Emergency > HighPriority > Routine/chưa phân luồng,
    cùng mức thì ai vào trước xếp trước. Client hỏi lại khoảng 2 giây một lần (US10)."""
    return queue_service.queue_today(db)


# ============================================================================ Lượt khám
@router.post("/visits", response_model=VisitWithWarnings, status_code=201)
def create_visit(body: VisitCreate, actor: User = Depends(_nurse_visit), db: Session = Depends(get_db)):
    visit = queue_service.create_visit(db, body, actor)
    db.commit()
    return _with_warnings(visit)


@router.get("/visits/stale", response_model=list[VisitOut])
def stale_visits(_: User = Depends(audit_view("visit", roles=("Nurse",))), db: Session = Depends(get_db)):
    """Lượt khám còn mở từ ngày trước, để y tá hủy."""
    return queue_service.stale_open_visits(db)


@router.post("/visits/stale/cancel", response_model=list[uuid.UUID])
def cancel_stale(body: BulkCancelRequest, actor: User = Depends(_nurse_visit), db: Session = Depends(get_db)):
    done = queue_service.cancel_stale(db, body.visit_ids, body.reason, actor)
    db.commit()
    return done


@router.get("/visits/{visit_id}", response_model=VisitWithWarnings)
def get_visit(visit_id: uuid.UUID,
              _: User = Depends(audit_view("visit", roles=CLINICAL_ROLES, id_param="visit_id")),
              db: Session = Depends(get_db)):
    return _with_warnings(queue_service.get_visit(db, visit_id))


@router.patch("/visits/{visit_id}", response_model=VisitWithWarnings)
def update_visit(visit_id: uuid.UUID, body: VisitUpdate, actor: User = Depends(_nurse_visit),
                 db: Session = Depends(get_db)):
    visit = queue_service.update_visit(db, visit_id, body, actor)
    db.commit()
    return _with_warnings(visit)


@router.patch("/visits/{visit_id}/check-in", response_model=VisitOut)
def check_in(visit_id: uuid.UUID, actor: User = Depends(_nurse_visit), db: Session = Depends(get_db)):
    visit = queue_service.check_in(db, visit_id, actor)
    db.commit()
    return visit


@router.patch("/visits/{visit_id}/start-exam", response_model=VisitOut)
def start_exam(visit_id: uuid.UUID, actor: User = Depends(_physician_visit), db: Session = Depends(get_db)):
    visit = queue_service.start_exam(db, visit_id, actor)
    db.commit()
    return visit


@router.patch("/visits/{visit_id}/release", response_model=VisitOut)
def release(visit_id: uuid.UUID, actor: User = Depends(_physician_visit), db: Session = Depends(get_db)):
    visit = queue_service.release(db, visit_id, actor)
    db.commit()
    return visit


@router.patch("/visits/{visit_id}/cancel", response_model=VisitOut)
def cancel(visit_id: uuid.UUID, body: CancelRequest, actor: User = Depends(_clinical_visit),
           db: Session = Depends(get_db)):
    visit = queue_service.cancel(db, visit_id, body.reason, actor)
    db.commit()
    return visit
