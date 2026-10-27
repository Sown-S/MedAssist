"""Khoa phòng và ca trực bác sĩ (ERD v1.9). Admin quản lý khoa; mọi vai trò xem danh sách khoa và ai đang trực;
bác sĩ tự bắt đầu, nghỉ giữa giờ, kết thúc ca của mình."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models import User
from app.schemas.department import DepartmentCreate, DepartmentOut, DepartmentUpdate, DutyBreak, DutyOut, DutyStart
from app.services import department_service

router = APIRouter(tags=["departments"])

_admin = require_roles("Admin", audit_entity="department")
_physician = require_roles("Physician", audit_entity="doctor_duty")


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(include_inactive: bool = Query(False), _: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    return department_service.list_departments(db, include_inactive=include_inactive)


@router.post("/admin/departments", response_model=DepartmentOut, status_code=201)
def create_department(body: DepartmentCreate, actor: User = Depends(_admin), db: Session = Depends(get_db)):
    out = department_service.create_department(db, body, actor)
    db.commit()
    return out


@router.patch("/admin/departments/{department_id}", response_model=DepartmentOut)
def update_department(department_id: uuid.UUID, body: DepartmentUpdate, actor: User = Depends(_admin),
                      db: Session = Depends(get_db)):
    out = department_service.update_department(db, department_id, body, actor)
    db.commit()
    return out


@router.get("/duty", response_model=list[DutyOut])
def list_duty(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Bác sĩ đang trực hôm nay: phòng nào, đang khám / trống / nghỉ. Client hỏi lại định kỳ."""
    return department_service.list_duty(db)


@router.post("/duty/start", response_model=DutyOut)
def start_duty(body: DutyStart, actor: User = Depends(_physician), db: Session = Depends(get_db)):
    out = department_service.start_duty(db, body.department_id, actor)
    db.commit()
    return out


@router.patch("/duty/break", response_model=DutyOut)
def set_break(body: DutyBreak, actor: User = Depends(_physician), db: Session = Depends(get_db)):
    out = department_service.set_break(db, body.on, actor)
    db.commit()
    return out


@router.delete("/duty", status_code=status.HTTP_204_NO_CONTENT)
def end_duty(actor: User = Depends(_physician), db: Session = Depends(get_db)) -> None:
    department_service.end_duty(db, actor)
    db.commit()
