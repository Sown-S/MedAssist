"""CONDITION_SYMPTOM — quan hệ bệnh-triệu chứng có trọng số (đồ thị Node 2).

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import decimal
import uuid

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, Numeric, PrimaryKeyConstraint, String, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ConditionSymptom(Base):
    __tablename__ = 'condition_symptom'
    __table_args__ = (
        CheckConstraint("condition_code::text ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text AND symptom_code::text ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text", name='chk_condition_symptom_code_format'),
        CheckConstraint("polarity::text = ANY (ARRAY['SUPPORTS'::character varying, 'CONTRADICTS'::character varying]::text[])", name='condition_symptom_polarity_check'),
        CheckConstraint("retired_reason::text = ANY (ARRAY['Superseded'::character varying, 'Deactivated'::character varying]::text[])", name='condition_symptom_retired_reason_check'),
        CheckConstraint("status::text = ANY (ARRAY['Draft'::character varying, 'PendingApproval'::character varying, 'Active'::character varying, 'Retired'::character varying]::text[])", name='condition_symptom_status_check'),
        CheckConstraint('version >= 1', name='condition_symptom_version_check'),
        CheckConstraint('weight >= 0::numeric AND weight <= 1::numeric', name='condition_symptom_weight_check'),
        ForeignKeyConstraint(['condition_code'], ['condition_key.condition_code'], name='fk_condition_symptom_condition'),
        ForeignKeyConstraint(['created_by'], ['users.user_id'], name='condition_symptom_created_by_fkey'),
        ForeignKeyConstraint(['release_id'], ['knowledge_release.release_id'], name='condition_symptom_release_id_fkey'),
        ForeignKeyConstraint(['retired_by'], ['users.user_id'], name='condition_symptom_retired_by_fkey'),
        ForeignKeyConstraint(['source_id'], ['knowledge_source.source_id'], name='condition_symptom_source_id_fkey'),
        ForeignKeyConstraint(['symptom_code'], ['symptom_key.symptom_code'], name='fk_condition_symptom_symptom'),
        PrimaryKeyConstraint('relation_id', name='condition_symptom_pkey'),
        UniqueConstraint('condition_code', 'symptom_code', 'version', name='uq_condition_symptom_version'),
        Index('idx_cond_symptom_cond_active', 'condition_code', postgresql_where="((status)::text = 'Active'::text)"),
        Index('idx_cond_symptom_release', 'release_id'),
        Index('idx_cond_symptom_sym_active', 'symptom_code', postgresql_where="((status)::text = 'Active'::text)"),
        Index('uq_condition_symptom_active', 'condition_code', 'symptom_code', postgresql_where="((status)::text = 'Active'::text)", unique=True)
    )

    relation_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    condition_code: Mapped[str] = mapped_column(String(80), nullable=False)
    symptom_code: Mapped[str] = mapped_column(String(50), nullable=False)
    polarity: Mapped[str] = mapped_column(String(12), nullable=False)
    weight: Mapped[decimal.Decimal] = mapped_column(Numeric(3, 2), nullable=False)
    is_key: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    source_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Draft'::character varying"))
    release_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    retired_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    retired_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    retired_reason: Mapped[str | None] = mapped_column(String(20))
