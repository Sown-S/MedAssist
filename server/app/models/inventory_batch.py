"""INVENTORY_BATCH — lô thuốc (FEFO, hạn dùng). remaining_quantity do trigger sổ cái cập nhật:
KHÔNG sửa tay (trg_inventory_batch_guard chặn).

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import decimal
import uuid

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKeyConstraint, Index, Integer, Numeric, PrimaryKeyConstraint, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class InventoryBatch(Base):
    __tablename__ = 'inventory_batch'
    __table_args__ = (
        CheckConstraint('import_price >= 0::numeric', name='inventory_batch_import_price_check'),
        CheckConstraint('initial_quantity > 0', name='inventory_batch_initial_quantity_check'),
        CheckConstraint('manufacturing_date IS NULL OR expiry_date > manufacturing_date', name='chk_batch_dates'),
        CheckConstraint('remaining_quantity >= 0', name='inventory_batch_remaining_quantity_check'),
        ForeignKeyConstraint(['created_by'], ['users.user_id'], name='inventory_batch_created_by_fkey'),
        ForeignKeyConstraint(['drug_id'], ['drug.drug_id'], name='inventory_batch_drug_id_fkey'),
        PrimaryKeyConstraint('batch_id', name='inventory_batch_pkey'),
        Index('idx_batch_drug_expiry', 'drug_id', 'expiry_date', postgresql_where='(remaining_quantity > 0)'),
        Index('uq_batch_drug_number', 'drug_id', 'batch_number', unique=True)
    )

    batch_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    drug_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    batch_number: Mapped[str] = mapped_column(String(50), nullable=False)
    expiry_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    manufacturing_date: Mapped[datetime.date | None] = mapped_column(Date)
    initial_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    remaining_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    import_price: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
