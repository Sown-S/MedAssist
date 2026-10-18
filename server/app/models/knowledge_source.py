"""KNOWLEDGE_SOURCE — nguồn tri thức (WHO, Bộ Y tế...), mọi dòng tri thức đều dẫn nguồn.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid

from sqlalchemy import Boolean, Date, DateTime, ForeignKeyConstraint, PrimaryKeyConstraint, String, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class KnowledgeSource(Base):
    __tablename__ = 'knowledge_source'
    __table_args__ = (
        ForeignKeyConstraint(['created_by'], ['users.user_id'], name='knowledge_source_created_by_fkey'),
        PrimaryKeyConstraint('source_id', name='knowledge_source_pkey')
    )

    source_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    organization: Mapped[str] = mapped_column(String(100), nullable=False)
    publication_date: Mapped[datetime.date | None] = mapped_column(Date)
    edition: Mapped[str | None] = mapped_column(String(50))
    url: Mapped[str | None] = mapped_column(Text)
    accessed_date: Mapped[datetime.date | None] = mapped_column(Date)
    license_note: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
