"""CONDITION — danh sách bệnh hợp lệ (ICD-10), phiên bản theo dòng.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Condition(Base):
    __tablename__ = 'condition'
    __table_args__ = (
        CheckConstraint("condition_code::text ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text", name='chk_condition_code_format'),
        CheckConstraint("retired_reason::text = ANY (ARRAY['Superseded'::character varying, 'Deactivated'::character varying]::text[])", name='condition_retired_reason_check'),
        CheckConstraint("status::text = ANY (ARRAY['Draft'::character varying, 'PendingApproval'::character varying, 'Active'::character varying, 'Retired'::character varying]::text[])", name='condition_status_check'),
        CheckConstraint('version >= 1', name='condition_version_check'),
        ForeignKeyConstraint(['condition_code'], ['condition_key.condition_code'], name='fk_condition_key'),
        ForeignKeyConstraint(['created_by'], ['users.user_id'], name='condition_created_by_fkey'),
        ForeignKeyConstraint(['release_id'], ['knowledge_release.release_id'], name='condition_release_id_fkey'),
        ForeignKeyConstraint(['retired_by'], ['users.user_id'], name='condition_retired_by_fkey'),
        PrimaryKeyConstraint('condition_id', name='condition_pkey'),
        UniqueConstraint('condition_code', 'version', name='uq_condition_code_version'),
        Index('idx_condition_group', 'disease_group', postgresql_where="((status)::text = 'Active'::text)"),
        Index('idx_condition_release', 'release_id'),
        Index('uq_condition_active', 'condition_code', postgresql_where="((status)::text = 'Active'::text)", unique=True)
    )

    condition_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    condition_code: Mapped[str] = mapped_column(String(80), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    name_vi: Mapped[str] = mapped_column(String(200), nullable=False)
    icd10_code: Mapped[str | None] = mapped_column(String(10))
    disease_group: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Draft'::character varying"))
    release_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    retired_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    retired_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    retired_reason: Mapped[str | None] = mapped_column(String(20))
