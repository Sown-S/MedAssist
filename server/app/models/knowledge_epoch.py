"""KNOWLEDGE_EPOCH — một dòng duy nhất; số hiệu tăng trong CÙNG transaction với mọi thay đổi
bảng tri thức (do trigger). Knowledge Reader so epoch để làm mới cache. App chỉ SELECT, UPDATE.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, PrimaryKeyConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class KnowledgeEpoch(Base):
    __tablename__ = 'knowledge_epoch'
    __table_args__ = (
        CheckConstraint('epoch >= 0', name='knowledge_epoch_epoch_check'),
        CheckConstraint('singleton', name='knowledge_epoch_singleton_check'),
        PrimaryKeyConstraint('singleton', name='knowledge_epoch_pkey')
    )

    singleton: Mapped[bool] = mapped_column(Boolean, primary_key=True, server_default=text('true'))
    epoch: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text('0'))
    changed_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
