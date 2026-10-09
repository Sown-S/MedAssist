"""INVOICE — hóa đơn một lượt khám; 3 khoản phí phải bằng tổng invoice_item cùng loại (constraint trigger hoãn).

Sinh từ lược đồ do Alembic 0001 tạo (medassist_schema_v1_8.sql) rồi biên tập; phải khớp
bảng thật — kiểm tra bằng `alembic check` / tests/test_db_guards.py.
"""
import datetime
import decimal
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, Numeric, PrimaryKeyConstraint, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Invoice(Base):
    __tablename__ = 'invoice'
    __table_args__ = (
        CheckConstraint('consultation_fee >= 0::numeric', name='invoice_consultation_fee_check'),
        CheckConstraint('drug_fee >= 0::numeric', name='invoice_drug_fee_check'),
        CheckConstraint('paraclinical_fee >= 0::numeric', name='invoice_paraclinical_fee_check'),
        CheckConstraint("payment_method::text = ANY (ARRAY['Cash'::character varying, 'BankingTransfer'::character varying]::text[])", name='invoice_payment_method_check'),
        CheckConstraint("payment_status::text <> 'Cancelled'::text OR cancelled_at IS NOT NULL", name='chk_invoice_cancelled_time'),
        CheckConstraint("payment_status::text <> 'Paid'::text OR paid_at IS NOT NULL", name='chk_invoice_paid_time'),
        CheckConstraint("payment_status::text = ANY (ARRAY['Pending'::character varying, 'Paid'::character varying, 'Cancelled'::character varying]::text[])", name='invoice_payment_status_check'),
        CheckConstraint('total_amount = (consultation_fee + paraclinical_fee + drug_fee)', name='chk_invoice_total'),
        ForeignKeyConstraint(['issued_by'], ['users.user_id'], name='invoice_issued_by_fkey'),
        ForeignKeyConstraint(['visit_id'], ['visit.visit_id'], name='invoice_visit_id_fkey'),
        PrimaryKeyConstraint('invoice_id', name='invoice_pkey'),
        UniqueConstraint('invoice_code', name='invoice_invoice_code_key'),
        Index('idx_invoice_paid_at', 'paid_at', postgresql_where="((payment_status)::text = 'Paid'::text)"),
        Index('uq_invoice_one_active_per_visit', 'visit_id', postgresql_where="((payment_status)::text <> 'Cancelled'::text)", unique=True)
    )

    invoice_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    visit_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    issued_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    invoice_code: Mapped[str] = mapped_column(String(50), nullable=False)
    consultation_fee: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default=text('0'))
    paraclinical_fee: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default=text('0'))
    drug_fee: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default=text('0'))
    total_amount: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(30), nullable=False, server_default=text("'Cash'::character varying"))
    payment_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'Pending'::character varying"))
    paid_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    cancelled_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(True))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
