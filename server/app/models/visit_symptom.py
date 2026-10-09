"""VISIT_SYMPTOM — triệu chứng tri-state (PRESENT/ABSENT/UNKNOWN) đã được Nurse xác nhận.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, PrimaryKeyConstraint, String, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class VisitSymptom(Base):
    __tablename__ = 'visit_symptom'
    __table_args__ = (
        CheckConstraint("source::text = ANY (ARRAY['Form'::character varying, 'Extracted'::character varying, 'Prompt'::character varying]::text[])", name='visit_symptom_source_check'),
        CheckConstraint("state::text = ANY (ARRAY['PRESENT'::character varying, 'ABSENT'::character varying, 'UNKNOWN'::character varying]::text[])", name='visit_symptom_state_check'),
        CheckConstraint("symptom_code::text ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text", name='chk_visit_symptom_code_format'),
        ForeignKeyConstraint(['confirmed_by'], ['users.user_id'], name='visit_symptom_confirmed_by_fkey'),
        ForeignKeyConstraint(['symptom_id', 'symptom_code'], ['symptom.symptom_id', 'symptom.symptom_code'], name='fk_visit_symptom_symptom'),
        ForeignKeyConstraint(['visit_id'], ['visit.visit_id'], name='visit_symptom_visit_id_fkey'),
        PrimaryKeyConstraint('visit_symptom_id', name='visit_symptom_pkey'),
        UniqueConstraint('visit_id', 'symptom_code', name='uq_visit_symptom'),
        Index('idx_visit_symptom_symptom', 'symptom_id'),
        Index('idx_visit_symptom_visit', 'visit_id')
    )

    visit_symptom_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    visit_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    symptom_code: Mapped[str] = mapped_column(String(50), nullable=False)
    symptom_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    state: Mapped[str] = mapped_column(String(10), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Form'::character varying"))
    confirmed_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    confirmed_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
