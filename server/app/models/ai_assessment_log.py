"""AI_ASSESSMENT_LOG — nhật ký AI và hàng đợi worker bền vững (Queued, lease). App không DELETE.
Huy đồng thiết kế; đổi cột qua migration do Sơn duyệt.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, SmallInteger, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AiAssessmentLog(Base):
    __tablename__ = 'ai_assessment_log'
    __table_args__ = (
        CheckConstraint("(status::text <> 'Completed'::text OR run_type::text <> 'Assessment'::text OR NOT mode::text IS DISTINCT FROM 'Full'::text) AND (status::text <> 'Degraded'::text OR NOT mode::text IS DISTINCT FROM 'RuleOnly'::text)", name='chk_ai_log_mode_status'),
        CheckConstraint("(status::text <> ALL (ARRAY['Completed'::character varying, 'Degraded'::character varying, 'Failed'::character varying, 'Skipped'::character varying]::text[])) OR completed_at IS NOT NULL", name='chk_ai_log_finished_time'),
        CheckConstraint('attempt_count >= 0', name='ai_assessment_log_attempt_count_check'),
        CheckConstraint("mode::text = ANY (ARRAY['Full'::character varying, 'RuleOnly'::character varying]::text[])", name='ai_assessment_log_mode_check'),
        CheckConstraint("physician_decision::text = ANY (ARRAY['AcceptedTop'::character varying, 'ChoseOther'::character varying, 'NoSuggestion'::character varying]::text[])", name='ai_assessment_log_physician_decision_check'),
        CheckConstraint("priority_final::text = ANY (ARRAY['Emergency'::character varying, 'HighPriority'::character varying, 'Routine'::character varying]::text[])", name='ai_assessment_log_priority_final_check'),
        CheckConstraint("priority_rule::text = ANY (ARRAY['Emergency'::character varying, 'HighPriority'::character varying, 'Routine'::character varying]::text[])", name='ai_assessment_log_priority_rule_check'),
        CheckConstraint("run_type::text = ANY (ARRAY['Extraction'::character varying, 'Assessment'::character varying]::text[])", name='ai_assessment_log_run_type_check'),
        CheckConstraint("status::text <> 'Running'::text OR started_at IS NOT NULL AND lease_until IS NOT NULL", name='chk_ai_log_running_lease'),
        CheckConstraint("status::text = ANY (ARRAY['Queued'::character varying, 'Running'::character varying, 'Completed'::character varying, 'Degraded'::character varying, 'Failed'::character varying, 'Skipped'::character varying]::text[])", name='ai_assessment_log_status_check'),
        ForeignKeyConstraint(['decided_by'], ['users.user_id'], name='ai_assessment_log_decided_by_fkey'),
        ForeignKeyConstraint(['knowledge_release_id'], ['knowledge_release.release_id'], name='ai_assessment_log_knowledge_release_id_fkey'),
        ForeignKeyConstraint(['triggered_by'], ['users.user_id'], name='ai_assessment_log_triggered_by_fkey'),
        ForeignKeyConstraint(['visit_id'], ['visit.visit_id'], name='ai_assessment_log_visit_id_fkey'),
        PrimaryKeyConstraint('assessment_id', name='ai_assessment_log_pkey'),
        UniqueConstraint('assessment_id', 'visit_id', 'run_type', name='uq_ai_log_assessment_visit_type'),
        Index('idx_ai_log_lease', 'lease_until', postgresql_where="((status)::text = 'Running'::text)"),
        Index('idx_ai_log_queue', 'queued_at', postgresql_where="((status)::text = 'Queued'::text)"),
        Index('idx_ai_log_release', 'knowledge_release_id'),
        Index('idx_ai_log_visit', 'visit_id', text('queued_at DESC'))
    )

    assessment_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    visit_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    run_type: Mapped[str] = mapped_column(String(20), nullable=False)
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Queued'::character varying"))
    mode: Mapped[str | None] = mapped_column(String(20))
    input_features: Mapped[Any | None] = mapped_column(JSONB)
    rule_hits: Mapped[Any | None] = mapped_column(JSONB)
    priority_rule: Mapped[str | None] = mapped_column(String(20))
    priority_final: Mapped[str | None] = mapped_column(String(20))
    candidates: Mapped[Any | None] = mapped_column(JSONB)
    llm_output_raw: Mapped[str | None] = mapped_column(Text)
    validation_result: Mapped[Any | None] = mapped_column(JSONB)
    error_detail: Mapped[str | None] = mapped_column(Text)
    knowledge_release_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    model_name: Mapped[str | None] = mapped_column(String(100))
    model_version: Mapped[str | None] = mapped_column(String(50))
    prompt_version: Mapped[str | None] = mapped_column(String(50))
    latency_phase1_ms: Mapped[int | None] = mapped_column(Integer)
    latency_llm_ms: Mapped[int | None] = mapped_column(Integer)
    latency_total_ms: Mapped[int | None] = mapped_column(Integer)
    physician_decision: Mapped[str | None] = mapped_column(String(20))
    decided_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    decided_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    queued_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    started_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    lease_until: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    attempt_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text('0'))
    completed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
