"""VISIT — lượt khám = mục hàng đợi; sinh hiệu (chỉ khóa chuẩn), ưu tiên tách luật/AI, ai_status.
red_flag_rule_type là cột sinh tự động (Computed): không gán giá trị.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, Computed, Date, DateTime, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, Text, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Visit(Base):
    __tablename__ = 'visit'
    __table_args__ = (
        CheckConstraint("COALESCE(\nCASE triage_priority\n    WHEN 'Emergency'::text THEN 3\n    WHEN 'HighPriority'::text THEN 2\n    WHEN 'Routine'::text THEN 1\n    ELSE NULL::integer\nEND, 0) >= COALESCE(\nCASE triage_priority_rule\n    WHEN 'Emergency'::text THEN 3\n    WHEN 'HighPriority'::text THEN 2\n    WHEN 'Routine'::text THEN 1\n    ELSE NULL::integer\nEND, 0)", name='chk_visit_priority_never_lowered'),
        CheckConstraint("NOT priority_raised_by_ai OR NOT triage_priority_rule::text IS DISTINCT FROM 'Routine'::text AND NOT triage_priority::text IS DISTINCT FROM 'HighPriority'::text", name='chk_visit_ai_raise_scope'),
        CheckConstraint("ai_status::text = ANY (ARRAY['Pending'::character varying, 'Preliminary'::character varying, 'Ready'::character varying, 'Degraded'::character varying, 'Failed'::character varying, 'Skipped'::character varying]::text[])", name='visit_ai_status_check'),
        CheckConstraint("is_red_flag = (NOT triage_priority::text IS DISTINCT FROM 'Emergency'::text) AND is_red_flag = (NOT triage_priority_rule::text IS DISTINCT FROM 'Emergency'::text)", name='chk_visit_red_flag_emergency'),
        CheckConstraint('is_red_flag = false OR red_flag_rule_id IS NOT NULL AND red_flag_reason IS NOT NULL', name='chk_visit_red_flag_rule'),
        CheckConstraint('queue_number > 0', name='visit_queue_number_check'),
        CheckConstraint("status::text = ANY (ARRAY['Waiting'::character varying, 'CheckedIn'::character varying, 'Examining'::character varying, 'Prescribed'::character varying, 'Finished'::character varying, 'Cancelled'::character varying]::text[])", name='visit_status_check'),
        CheckConstraint("triage_priority::text = ANY (ARRAY['Emergency'::character varying, 'HighPriority'::character varying, 'Routine'::character varying]::text[])", name='visit_triage_priority_check'),
        CheckConstraint("triage_priority_rule::text = ANY (ARRAY['Emergency'::character varying, 'HighPriority'::character varying, 'Routine'::character varying]::text[])", name='visit_triage_priority_rule_check'),
        CheckConstraint('vital_signs IS NULL OR jsonb_typeof(vital_signs) = \'object\'::text AND (vital_signs - fn_vital_sign_keys()) = \'{}\'::jsonb AND NOT jsonb_path_exists(vital_signs, \'$.*?(@.type() != "number")\'::jsonpath)', name='chk_visit_vital_signs_keys'),
        ForeignKeyConstraint(['nurse_id'], ['users.user_id'], name='visit_nurse_id_fkey'),
        ForeignKeyConstraint(['patient_id'], ['patient.patient_id'], name='visit_patient_id_fkey'),
        ForeignKeyConstraint(['physician_id'], ['users.user_id'], name='visit_physician_id_fkey'),
        ForeignKeyConstraint(['red_flag_rule_id', 'red_flag_rule_type'], ['triage_rule.triage_rule_id', 'triage_rule.rule_type'], name='fk_visit_red_flag_rule'),
        PrimaryKeyConstraint('visit_id', name='visit_pkey'),
        Index('idx_visit_patient', 'patient_id', text('visit_date DESC')),
        Index('idx_visit_physician', 'physician_id'),
        Index('idx_visit_queue', 'queue_date', 'status', 'triage_priority', 'visit_date', postgresql_where="((status)::text = ANY ((ARRAY['Waiting'::character varying, 'CheckedIn'::character varying])::text[]))"),
        Index('uq_visit_queue_number', 'queue_date', 'queue_number', postgresql_where='(queue_number IS NOT NULL)', unique=True)
    )

    visit_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    nurse_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    physician_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    visit_date: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    queue_date: Mapped[datetime.date] = mapped_column(Date, nullable=False, server_default=text('CURRENT_DATE'))
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Waiting'::character varying"))
    queue_number: Mapped[int | None] = mapped_column(Integer)
    checked_in_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    vital_signs: Mapped[Any | None] = mapped_column(JSONB(none_as_null=True))
    chief_complaint: Mapped[str] = mapped_column(Text, nullable=False)
    free_text_description: Mapped[str | None] = mapped_column(Text)
    triage_priority_rule: Mapped[str | None] = mapped_column(String(20))
    triage_priority: Mapped[str | None] = mapped_column(String(20))
    priority_raised_by_ai: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    ai_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Pending'::character varying"))
    is_red_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    red_flag_reason: Mapped[str | None] = mapped_column(Text)
    red_flag_rule_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    red_flag_rule_type: Mapped[str | None] = mapped_column(String(20), Computed("\nCASE\n    WHEN (red_flag_rule_id IS NULL) THEN NULL::text\n    ELSE 'RED_FLAG'::text\nEND", persisted=True))
    exam_started_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    finished_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
