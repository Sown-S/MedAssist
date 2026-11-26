"""CREDIT_NOTE, CREDIT_NOTE_ITEM — phiếu hoàn tiền cho hóa đơn đã thu (ERD §2.20a).
Chỉ thêm: app không có UPDATE/DELETE; dòng gốc, trạng thái Paid, số lượng và tổng tiền do trigger ép."""

import decimal
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CreditNote(Base):
    __tablename__ = "credit_note"
    __table_args__ = (
        ForeignKeyConstraint(["invoice_id"], ["invoice.invoice_id"], name="fk_credit_note_invoice"),
        ForeignKeyConstraint(["issued_by"], ["users.user_id"], name="credit_note_issued_by_fkey"),
        UniqueConstraint("credit_code", name="uq_credit_note_code"),
        CheckConstraint("total_amount > 0", name="credit_note_total_amount_check"),
        CheckConstraint("refund_method IN ('Cash', 'BankingTransfer')", name="chk_credit_note_refund_method"),
        Index("idx_credit_note_invoice", "invoice_id"),
    )

    credit_note_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    invoice_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    credit_code: Mapped[str] = mapped_column(String(50))
    reason: Mapped[str] = mapped_column(Text)
    total_amount: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2))
    refund_method: Mapped[str] = mapped_column(String(30), server_default=text("'Cash'"))
    issued_by: Mapped[uuid.UUID] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class CreditNoteItem(Base):
    __tablename__ = "credit_note_item"
    __table_args__ = (
        ForeignKeyConstraint(
            ["credit_note_id"], ["credit_note.credit_note_id"], name="credit_note_item_credit_note_id_fkey"
        ),
        ForeignKeyConstraint(
            ["invoice_item_id"], ["invoice_item.invoice_item_id"], name="fk_credit_note_item_invoice_item"
        ),
        CheckConstraint("quantity > 0", name="credit_note_item_quantity_check"),
        CheckConstraint("unit_price >= 0", name="credit_note_item_unit_price_check"),
        CheckConstraint("subtotal = quantity * unit_price", name="chk_credit_note_item_subtotal"),
        Index("idx_credit_note_item_invoice_item", "invoice_item_id"),
    )

    credit_item_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    credit_note_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    invoice_item_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    item_name: Mapped[str] = mapped_column(String(150))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2))
    subtotal: Mapped[decimal.Decimal] = mapped_column(Numeric(12, 2))
