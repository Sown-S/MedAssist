"""SYMPTOM — danh mục triệu chứng, phiên bản theo dòng (một dòng Active mỗi mã).

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Symptom(Base):
    __tablename__ = 'symptom'
    __table_args__ = (
        CheckConstraint("retired_reason::text = ANY (ARRAY['Superseded'::character varying, 'Deactivated'::character varying]::text[])", name='symptom_retired_reason_check'),
        CheckConstraint("status::text = ANY (ARRAY['Draft'::character varying, 'PendingApproval'::character varying, 'Active'::character varying, 'Retired'::character varying]::text[])", name='symptom_status_check'),
        CheckConstraint("symptom_code::text ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text", name='chk_symptom_code_format'),
        CheckConstraint('version >= 1', name='symptom_version_check'),
        ForeignKeyConstraint(['created_by'], ['users.user_id'], name='symptom_created_by_fkey'),
        ForeignKeyConstraint(['release_id'], ['knowledge_release.release_id'], name='symptom_release_id_fkey'),
        ForeignKeyConstraint(['retired_by'], ['users.user_id'], name='symptom_retired_by_fkey'),
        ForeignKeyConstraint(['symptom_code'], ['symptom_key.symptom_code'], name='fk_symptom_key'),
        PrimaryKeyConstraint('symptom_id', name='symptom_pkey'),
        UniqueConstraint('symptom_code', 'version', name='uq_symptom_code_version'),
        UniqueConstraint('symptom_id', 'symptom_code', name='uq_symptom_id_code'),
        Index('idx_symptom_release', 'release_id'),
        Index('uq_symptom_active', 'symptom_code', postgresql_where="((status)::text = 'Active'::text)", unique=True)
    )

    symptom_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    symptom_code: Mapped[str] = mapped_column(String(50), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    symptom_name: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Draft'::character varying"))
    release_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    retired_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    retired_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    retired_reason: Mapped[str | None] = mapped_column(String(20))
