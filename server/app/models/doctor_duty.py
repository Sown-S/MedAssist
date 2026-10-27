"""DOCTOR_DUTY — ca trực của bác sĩ tại một khoa/phòng (ERD v1.9 mục 2.1b). Kết thúc ca thì ghi ended_at, không xóa."""
import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

_OPEN = text("ended_at IS NULL")


class DoctorDuty(Base):
    __tablename__ = "doctor_duty"
    __table_args__ = (
        CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="chk_doctor_duty_time"),
        CheckConstraint("ended_at IS NULL OR break_since IS NULL", name="chk_doctor_duty_break_open"),
        Index("uq_doctor_duty_open_physician", "physician_id", unique=True, postgresql_where=_OPEN),
        Index("uq_doctor_duty_open_department", "department_id", unique=True, postgresql_where=_OPEN),
        Index("idx_doctor_duty_date", "duty_date"),
    )

    duty_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    physician_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.user_id", name="fk_doctor_duty_physician"))
    department_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("department.department_id", name="fk_doctor_duty_department"))
    duty_date: Mapped[date] = mapped_column(Date, server_default=text("CURRENT_DATE"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    break_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
