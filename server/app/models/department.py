"""DEPARTMENT — khoa phòng và phòng khám (ERD v1.9 mục 2.1a). Không xóa: ngừng dùng bằng is_active."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, String, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Department(Base):
    __tablename__ = "department"
    __table_args__ = (
        UniqueConstraint("code", name="uq_department_code"),
        CheckConstraint("code ~ '^[A-Za-z0-9_-]+$'", name="chk_department_code_format"),
        Index("uq_department_active_room", "room", unique=True,
              postgresql_where=text("is_active AND room IS NOT NULL")),
    )

    department_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    code: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(100))
    room: Mapped[str | None] = mapped_column(String(30))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
