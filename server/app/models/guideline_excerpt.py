"""GUIDELINE_EXCERPT — trích đoạn khuyến cáo có dẫn nguồn, khóa slug excerpt_key.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GuidelineExcerpt(Base):
    __tablename__ = 'guideline_excerpt'
    __table_args__ = (
        CheckConstraint("excerpt_key::text ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text AND condition_code::text ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text", name='chk_guideline_excerpt_code_format'),
        CheckConstraint("retired_reason::text = ANY (ARRAY['Superseded'::character varying, 'Deactivated'::character varying]::text[])", name='guideline_excerpt_retired_reason_check'),
        CheckConstraint("status::text = ANY (ARRAY['Draft'::character varying, 'PendingApproval'::character varying, 'Active'::character varying, 'Retired'::character varying]::text[])", name='guideline_excerpt_status_check'),
        CheckConstraint('version >= 1', name='guideline_excerpt_version_check'),
        ForeignKeyConstraint(['condition_code'], ['condition_key.condition_code'], name='fk_excerpt_condition'),
        ForeignKeyConstraint(['created_by'], ['users.user_id'], name='guideline_excerpt_created_by_fkey'),
        ForeignKeyConstraint(['release_id'], ['knowledge_release.release_id'], name='guideline_excerpt_release_id_fkey'),
        ForeignKeyConstraint(['retired_by'], ['users.user_id'], name='guideline_excerpt_retired_by_fkey'),
        ForeignKeyConstraint(['source_id'], ['knowledge_source.source_id'], name='guideline_excerpt_source_id_fkey'),
        PrimaryKeyConstraint('excerpt_id', name='guideline_excerpt_pkey'),
        UniqueConstraint('excerpt_key', 'version', name='uq_excerpt_key_version'),
        Index('idx_excerpt_condition_active', 'condition_code', postgresql_where="((status)::text = 'Active'::text)"),
        Index('uq_excerpt_active', 'excerpt_key', postgresql_where="((status)::text = 'Active'::text)", unique=True)
    )

    excerpt_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    excerpt_key: Mapped[str] = mapped_column(String(80), nullable=False)
    condition_code: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    source_locator: Mapped[str | None] = mapped_column(String(100))
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Draft'::character varying"))
    release_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    retired_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    retired_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    retired_reason: Mapped[str | None] = mapped_column(String(20))
