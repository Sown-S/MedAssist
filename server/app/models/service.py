"""SERVICE, SERVICE_PACKAGE — danh mục dịch vụ, xét nghiệm và gói khám có giá (ERD v2.1 mục 2.20a).
Không xóa: ngừng dùng bằng is_active. Lịch sử giá đọc từ audit_log."""
import decimal
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, Numeric, String, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

SERVICE_KINDS = ("Service", "Lab")


class Service(Base):
    __tablename__ = "service"
    __table_args__ = (
        CheckConstraint("code ~ '^[A-Za-z0-9_-]+$'", name="chk_service_code_format"),
        CheckConstraint("kind IN ('Service','Lab')", name="chk_service_kind"),
        CheckConstraint("price >= 0", name="service_price_check"),
        CheckConstraint("ref_low IS NULL OR ref_high IS NULL OR ref_low <= ref_high", name="chk_service_ref_range"),
        Index("uq_service_code", "code", unique=True),
    )

    service_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    code: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(150))
    kind: Mapped[str] = mapped_column(String(10))
    group_key: Mapped[str] = mapped_column(String(30))
    unit: Mapped[str | None] = mapped_column(String(30))
    price: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2), server_default=text("0"))
    ref_low: Mapped[decimal.Decimal | None] = mapped_column(Numeric(12, 3))
    ref_high: Mapped[decimal.Decimal | None] = mapped_column(Numeric(12, 3))
    ref_text: Mapped[str | None] = mapped_column(String(100))
    sample: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class ServicePackage(Base):
    __tablename__ = "service_package"
    __table_args__ = (
        CheckConstraint("code ~ '^[A-Za-z0-9_-]+$'", name="chk_service_package_code_format"),
        CheckConstraint("price >= 0", name="service_package_price_check"),
        CheckConstraint("jsonb_typeof(items) = 'array'", name="chk_service_package_items"),
        Index("uq_service_package_code", "code", unique=True),
    )

    package_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    code: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(150))
    price: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2))
    items: Mapped[list] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
