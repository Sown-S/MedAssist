"""PRESCRIPTION_ITEM — từng dòng thuốc, trạng thái cấp phát.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PrescriptionItem(Base):
    __tablename__ = 'prescription_item'
    __table_args__ = (
        CheckConstraint("dispense_status::text <> 'Skipped'::text OR skip_reason IS NOT NULL", name='chk_item_skip_reason'),
        CheckConstraint("dispense_status::text = ANY (ARRAY['Pending'::character varying, 'Dispensed'::character varying, 'Skipped'::character varying]::text[])", name='prescription_item_dispense_status_check'),
        CheckConstraint('duration_days > 0', name='prescription_item_duration_days_check'),
        CheckConstraint('quantity > 0', name='prescription_item_quantity_check'),
        ForeignKeyConstraint(['dispensed_by'], ['users.user_id'], name='prescription_item_dispensed_by_fkey'),
        ForeignKeyConstraint(['drug_id'], ['drug.drug_id'], name='prescription_item_drug_id_fkey'),
        ForeignKeyConstraint(['prescription_id'], ['prescription.prescription_id'], name='prescription_item_prescription_id_fkey'),
        PrimaryKeyConstraint('item_id', name='prescription_item_pkey'),
        Index('idx_presc_item_drug', 'drug_id'),
        Index('idx_presc_item_presc', 'prescription_id')
    )

    item_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    prescription_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    drug_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    dosage: Mapped[str] = mapped_column(String(100), nullable=False)
    frequency: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    dispense_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Pending'::character varying"))
    skip_reason: Mapped[str | None] = mapped_column(Text)
    dispensed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    dispensed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    instruction: Mapped[str | None] = mapped_column(Text)
