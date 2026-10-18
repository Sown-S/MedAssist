"""DRUG — danh mục thuốc (US05). Trùng định danh chặn bằng uq_drug_identity (không phân biệt hoa thường).

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import decimal
import uuid

from sqlalchemy import Boolean, CheckConstraint, Index, Integer, Numeric, PrimaryKeyConstraint, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Drug(Base):
    __tablename__ = 'drug'
    __table_args__ = (
        CheckConstraint('reorder_level >= 0', name='drug_reorder_level_check'),
        CheckConstraint('sale_price >= 0::numeric', name='drug_sale_price_check'),
        PrimaryKeyConstraint('drug_id', name='drug_pkey'),
        Index('uq_drug_identity', text('lower(generic_name)'), text('lower(trade_name)'), text('lower(strength)'), text('lower(dosage_form)'), unique=True)
    )

    drug_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    generic_name: Mapped[str] = mapped_column(String(150), nullable=False)
    trade_name: Mapped[str] = mapped_column(String(150), nullable=False)
    strength: Mapped[str] = mapped_column(String(50), nullable=False)
    dosage_form: Mapped[str] = mapped_column(String(50), nullable=False)
    active_ingredient_code: Mapped[str | None] = mapped_column(String(50))
    drug_class: Mapped[str | None] = mapped_column(String(100))
    unit: Mapped[str] = mapped_column(String(30), nullable=False)
    sale_price: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reorder_level: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
