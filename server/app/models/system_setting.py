"""SYSTEM_SETTING (ERD §2.22). Tham số vận hành do Admin chỉnh (khóa-giá trị JSONB);
giá trị được kiểm tra kiểu ở lớp validation trước khi lưu, mỗi thay đổi ghi AUDIT_LOG.
"""
import datetime
import uuid
from typing import Any

from sqlalchemy import DateTime, ForeignKeyConstraint, PrimaryKeyConstraint, String, Text, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SystemSetting(Base):
    __tablename__ = 'system_setting'
    __table_args__ = (
        ForeignKeyConstraint(['updated_by'], ['users.user_id'], name='system_setting_updated_by_fkey'),
        PrimaryKeyConstraint('setting_key', name='system_setting_pkey')
    )

    setting_key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB(none_as_null=True), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    updated_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
