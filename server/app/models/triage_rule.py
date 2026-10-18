"""TRIAGE_RULE — luật RED_FLAG (rf_) / PRIORITY_FLOOR (pf_); condition_logic là cây AND/OR
theo đặc tả OKF (validator ở Sprint 3).

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TriageRule(Base):
    __tablename__ = 'triage_rule'
    __table_args__ = (
        CheckConstraint("resulting_priority::text = ANY (ARRAY['Emergency'::character varying, 'HighPriority'::character varying]::text[])", name='triage_rule_resulting_priority_check'),
        CheckConstraint("retired_reason::text = ANY (ARRAY['Superseded'::character varying, 'Deactivated'::character varying]::text[])", name='triage_rule_retired_reason_check'),
        CheckConstraint("rule_key::text ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text AND (rule_type::text = 'RED_FLAG'::text AND rule_key::text ~ '^rf_'::text OR rule_type::text = 'PRIORITY_FLOOR'::text AND rule_key::text ~ '^pf_'::text)", name='chk_triage_rule_key_format'),
        CheckConstraint("rule_type::text = 'RED_FLAG'::text AND resulting_priority::text = 'Emergency'::text OR rule_type::text = 'PRIORITY_FLOOR'::text AND resulting_priority::text = 'HighPriority'::text", name='chk_triage_rule_type_priority'),
        CheckConstraint("rule_type::text = ANY (ARRAY['RED_FLAG'::character varying, 'PRIORITY_FLOOR'::character varying]::text[])", name='triage_rule_rule_type_check'),
        CheckConstraint("status::text = ANY (ARRAY['Draft'::character varying, 'PendingApproval'::character varying, 'Active'::character varying, 'Retired'::character varying]::text[])", name='triage_rule_status_check'),
        CheckConstraint('version >= 1', name='triage_rule_version_check'),
        ForeignKeyConstraint(['created_by'], ['users.user_id'], name='triage_rule_created_by_fkey'),
        ForeignKeyConstraint(['release_id'], ['knowledge_release.release_id'], name='triage_rule_release_id_fkey'),
        ForeignKeyConstraint(['retired_by'], ['users.user_id'], name='triage_rule_retired_by_fkey'),
        ForeignKeyConstraint(['source_id'], ['knowledge_source.source_id'], name='triage_rule_source_id_fkey'),
        PrimaryKeyConstraint('triage_rule_id', name='triage_rule_pkey'),
        UniqueConstraint('rule_key', 'version', name='uq_triage_rule_key_version'),
        UniqueConstraint('triage_rule_id', 'rule_type', name='uq_triage_rule_id_type'),
        Index('idx_triage_rule_logic', 'condition_logic', postgresql_using='gin'),
        Index('idx_triage_rule_release', 'release_id'),
        Index('uq_triage_rule_active', 'rule_key', postgresql_where="((status)::text = 'Active'::text)", unique=True)
    )

    triage_rule_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    rule_key: Mapped[str] = mapped_column(String(80), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    rule_name: Mapped[str] = mapped_column(String(255), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(20), nullable=False)
    condition_logic: Mapped[Any] = mapped_column(JSONB(none_as_null=True), nullable=False)
    resulting_priority: Mapped[str] = mapped_column(String(20), nullable=False)
    reason_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Draft'::character varying"))
    release_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    retired_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    retired_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    retired_reason: Mapped[str | None] = mapped_column(String(20))
