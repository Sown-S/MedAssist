"""INVOICE_ITEM — dòng hóa đơn: Drug / Paraclinical (nhập tay) / Consultation.

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import decimal
import uuid

from sqlalchemy import CheckConstraint, ForeignKeyConstraint, Index, Integer, Numeric, PrimaryKeyConstraint, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class InvoiceItem(Base):
    __tablename__ = 'invoice_item'
    __table_args__ = (
        CheckConstraint("item_type::text = 'Drug'::text AND prescription_item_id IS NOT NULL OR (item_type::text = ANY (ARRAY['Paraclinical'::character varying, 'Consultation'::character varying]::text[])) AND prescription_item_id IS NULL", name='chk_invoice_item_source'),
        CheckConstraint("item_type::text = ANY (ARRAY['Consultation'::character varying, 'Paraclinical'::character varying, 'Drug'::character varying]::text[])", name='invoice_item_item_type_check'),
        CheckConstraint('quantity > 0', name='invoice_item_quantity_check'),
        CheckConstraint('subtotal = (quantity::numeric * unit_price)', name='chk_invoice_item_subtotal'),
        CheckConstraint('unit_price >= 0::numeric', name='invoice_item_unit_price_check'),
        ForeignKeyConstraint(['invoice_id'], ['invoice.invoice_id'], name='invoice_item_invoice_id_fkey'),
        ForeignKeyConstraint(['prescription_item_id'], ['prescription_item.item_id'], name='invoice_item_prescription_item_id_fkey'),
        PrimaryKeyConstraint('invoice_item_id', name='invoice_item_pkey'),
        Index('idx_invoice_item_inv', 'invoice_id'),
        Index('idx_invoice_item_presc', 'prescription_item_id')
    )

    invoice_item_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    invoice_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    item_type: Mapped[str] = mapped_column(String(30), nullable=False)
    prescription_item_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    item_name: Mapped[str] = mapped_column(String(150), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    subtotal: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2), nullable=False)
