"""PATIENT — hành chính, tiền sử bệnh, dị ứng. Tìm không dấu qua idx_patient_name_trgm:
WHERE lower(f_unaccent(full_name)) LIKE '%' || lower(f_unaccent(:q)) || '%'.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid
from typing import Any

from sqlalchemy import column, func, CheckConstraint, Date, DateTime, Index, PrimaryKeyConstraint, String, Text, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Patient(Base):
    __tablename__ = 'patient'
    __table_args__ = (
        CheckConstraint("gender::text = ANY (ARRAY['Male'::character varying, 'Female'::character varying, 'Other'::character varying]::text[])", name='patient_gender_check'),
        PrimaryKeyConstraint('patient_id', name='patient_pkey'),
        Index('idx_patient_name_trgm', func.lower(func.f_unaccent(column('full_name'))).label('name_unaccent'),
              postgresql_using='gin', postgresql_ops={'name_unaccent': 'gin_trgm_ops'}),
        Index('idx_patient_phone', 'phone', postgresql_where='(phone IS NOT NULL)'),
        Index('uq_patient_id_number', 'id_number', postgresql_where='(id_number IS NOT NULL)', unique=True)
    )

    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    id_number: Mapped[str | None] = mapped_column(String(20))
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    date_of_birth: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    gender: Mapped[str] = mapped_column(String(10), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(String(255))
    medical_history: Mapped[Any | None] = mapped_column(JSONB(none_as_null=True))
    allergy_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
