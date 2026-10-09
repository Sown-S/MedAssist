"""STOCK_MOVEMENT — sổ cái biến động tồn kho, CHỈ THÊM (medassist_app không có UPDATE/DELETE).

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StockMovement(Base):
    __tablename__ = 'stock_movement'
    __table_args__ = (
        CheckConstraint("(movement_type::text = 'Adjustment'::text) = (reason_code IS NOT NULL) AND (reason_code::text IS DISTINCT FROM 'Other'::text OR note IS NOT NULL)", name='chk_stock_adjustment_reason'),
        CheckConstraint("(movement_type::text = ANY (ARRAY['Deduct'::character varying, 'Restore'::character varying]::text[])) = (prescription_item_id IS NOT NULL)", name='chk_stock_movement_ref'),
        CheckConstraint("movement_type::text = 'Deduct'::text AND quantity_change < 0 OR movement_type::text = 'Restore'::text AND quantity_change > 0 OR movement_type::text = 'Adjustment'::text AND quantity_change <> 0", name='chk_stock_movement_sign'),
        CheckConstraint("movement_type::text = ANY (ARRAY['Deduct'::character varying, 'Restore'::character varying, 'Adjustment'::character varying]::text[])", name='stock_movement_movement_type_check'),
        CheckConstraint("reason_code::text = ANY (ARRAY['Expired'::character varying, 'Damaged'::character varying, 'Lost'::character varying, 'CountCorrection'::character varying, 'Other'::character varying]::text[])", name='stock_movement_reason_code_check'),
        ForeignKeyConstraint(['batch_id'], ['inventory_batch.batch_id'], name='stock_movement_batch_id_fkey'),
        ForeignKeyConstraint(['performed_by'], ['users.user_id'], name='stock_movement_performed_by_fkey'),
        ForeignKeyConstraint(['prescription_item_id'], ['prescription_item.item_id'], name='stock_movement_prescription_item_id_fkey'),
        PrimaryKeyConstraint('movement_id', name='stock_movement_pkey'),
        Index('idx_stock_movement_batch', 'batch_id'),
        Index('idx_stock_movement_item', 'prescription_item_id')
    )

    movement_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    batch_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    performed_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    movement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    quantity_change: Mapped[int] = mapped_column(Integer, nullable=False)
    prescription_item_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    reason_code: Mapped[str | None] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
