"""REFERRAL_FACILITY — danh mục cơ sở nhận chuyển tuyến (ERD v2.0 mục 2.10a).
Nạp bằng scripts.seed_referral_facilities từ server/data/hospitals.csv; không xóa, ngừng dùng bằng is_active."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, String, Text, Uuid, column, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

FACILITY_TYPES = ("Hospital", "HealthCenter")
OWNERSHIPS = ("Public", "Ministry", "Private")


class ReferralFacility(Base):
    __tablename__ = "referral_facility"
    __table_args__ = (
        CheckConstraint("kcb_code ~ '^[0-9A-Za-z]+$'", name="chk_referral_facility_kcb_code"),
        CheckConstraint("facility_type IN ('Hospital','HealthCenter')", name="chk_referral_facility_type"),
        CheckConstraint("ownership IN ('Public','Ministry','Private')", name="chk_referral_facility_ownership"),
        Index("uq_referral_facility_kcb_code", "kcb_code", unique=True, postgresql_where=text("kcb_code IS NOT NULL")),
        Index("uq_referral_facility_identity", "province",
              func.lower(func.f_unaccent(column("name"))).label("name_unaccent"), unique=True),
        Index("idx_referral_facility_name_trgm", func.lower(func.f_unaccent(column("name"))).label("name_unaccent"),
              postgresql_using="gin", postgresql_ops={"name_unaccent": "gin_trgm_ops"}),
    )

    facility_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    kcb_code: Mapped[str | None] = mapped_column(String(10))
    name: Mapped[str] = mapped_column(String(255))
    province: Mapped[str] = mapped_column(String(100))
    address: Mapped[str | None] = mapped_column(Text)
    facility_type: Mapped[str] = mapped_column(String(20))
    ownership: Mapped[str | None] = mapped_column(String(20))
    tech_level: Mapped[str | None] = mapped_column(String(50))
    source_doc: Mapped[str | None] = mapped_column(String(255))
    source_file: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
