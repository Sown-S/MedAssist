"""KNOWLEDGE_RELEASE — bản phát hành tri thức: Draft > PendingApproval > Active > Retired.
Chỉ một bản đang mở (uq_release_single_open); người duyệt khác người soạn.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, PrimaryKeyConstraint, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class KnowledgeRelease(Base):
    __tablename__ = 'knowledge_release'
    __table_args__ = (
        CheckConstraint('approved_by IS NULL OR approved_by <> created_by', name='chk_release_approver_not_author'),
        CheckConstraint("status::text <> 'Active'::text OR approved_by IS NOT NULL AND approved_at IS NOT NULL", name='chk_release_active_approved'),
        CheckConstraint("status::text = ANY (ARRAY['Draft'::character varying, 'PendingApproval'::character varying, 'Active'::character varying]::text[])", name='knowledge_release_status_check'),
        ForeignKeyConstraint(['approved_by'], ['users.user_id'], name='knowledge_release_approved_by_fkey'),
        ForeignKeyConstraint(['created_by'], ['users.user_id'], name='knowledge_release_created_by_fkey'),
        PrimaryKeyConstraint('release_id', name='knowledge_release_pkey'),
        UniqueConstraint('label', name='knowledge_release_label_key'),
        Index('idx_release_status', 'status'),
        Index('uq_release_single_open', text('(true)'), postgresql_where=text("status IN ('Draft', 'PendingApproval')"), unique=True)
    )

    release_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    label: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Draft'::character varying"))
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    submitted_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    approved_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    review_note: Mapped[str | None] = mapped_column(Text)
