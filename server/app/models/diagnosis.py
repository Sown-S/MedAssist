"""DIAGNOSIS — chẩn đoán bác sĩ xác nhận; gắn lần chạy Assessment của chính lượt khám (FK kép).

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid

from sqlalchemy import Boolean, CheckConstraint, Computed, DateTime, ForeignKeyConstraint, Index, PrimaryKeyConstraint, String, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Diagnosis(Base):
    __tablename__ = 'diagnosis'
    __table_args__ = (
        CheckConstraint("condition_code IS NULL OR condition_code::text ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text", name='chk_diagnosis_code_format'),
        CheckConstraint('confirmed_by_physician = false OR confirmed_at IS NOT NULL', name='chk_diagnosis_confirmed_time'),
        ForeignKeyConstraint(['assessment_id', 'visit_id', 'assessment_run_type'], ['ai_assessment_log.assessment_id', 'ai_assessment_log.visit_id', 'ai_assessment_log.run_type'], name='fk_diagnosis_assessment'),
        ForeignKeyConstraint(['condition_code'], ['condition_key.condition_code'], name='fk_diagnosis_condition'),
        ForeignKeyConstraint(['physician_id'], ['users.user_id'], name='diagnosis_physician_id_fkey'),
        ForeignKeyConstraint(['visit_id'], ['visit.visit_id'], name='diagnosis_visit_id_fkey'),
        PrimaryKeyConstraint('diagnosis_id', name='diagnosis_pkey'),
        Index('idx_diagnosis_condition', 'condition_code', postgresql_where='(condition_code IS NOT NULL)'),
        Index('idx_diagnosis_visit', 'visit_id'),
        Index('uq_diagnosis_primary_per_visit', 'visit_id', postgresql_where='is_primary', unique=True)
    )

    diagnosis_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    visit_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    physician_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    assessment_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    assessment_run_type: Mapped[str | None] = mapped_column(String(20), Computed("\nCASE\n    WHEN (assessment_id IS NULL) THEN NULL::text\n    ELSE 'Assessment'::text\nEND", persisted=True))
    condition_code: Mapped[str | None] = mapped_column(String(80))
    icd10_code: Mapped[str | None] = mapped_column(String(10))
    diagnosis_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    matches_top_suggestion: Mapped[bool | None] = mapped_column(Boolean)
    confirmed_by_physician: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    clinical_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    confirmed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
