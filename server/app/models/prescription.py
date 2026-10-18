"""PRESCRIPTION — đơn thuốc; tối đa một đơn chưa hủy mỗi lượt khám.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, PrimaryKeyConstraint, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Prescription(Base):
    __tablename__ = 'prescription'
    __table_args__ = (
        CheckConstraint("(status::text <> ALL (ARRAY['Confirmed'::character varying, 'Dispensed'::character varying]::text[])) OR confirmed_at IS NOT NULL", name='chk_prescription_confirmed_time'),
        CheckConstraint("status::text = ANY (ARRAY['Draft'::character varying, 'Confirmed'::character varying, 'Dispensed'::character varying, 'Cancelled'::character varying]::text[])", name='prescription_status_check'),
        ForeignKeyConstraint(['physician_id'], ['users.user_id'], name='prescription_physician_id_fkey'),
        ForeignKeyConstraint(['visit_id'], ['visit.visit_id'], name='prescription_visit_id_fkey'),
        PrimaryKeyConstraint('prescription_id', name='prescription_pkey'),
        Index('idx_prescription_visit', 'visit_id'),
        Index('uq_prescription_one_active_per_visit', 'visit_id', postgresql_where="((status)::text <> 'Cancelled'::text)", unique=True)
    )

    prescription_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    visit_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    physician_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Draft'::character varying"))
    confirmed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    cancelled_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
