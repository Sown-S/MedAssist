import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.inventory import MoneyOut


class InvoiceItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    invoice_item_id: uuid.UUID
    item_type: str
    prescription_item_id: uuid.UUID | None
    item_name: str
    quantity: int
    unit_price: MoneyOut
    subtotal: MoneyOut


class InvoiceOut(BaseModel):
    invoice_id: uuid.UUID
    visit_id: uuid.UUID
    invoice_code: str
    consultation_fee: MoneyOut
    paraclinical_fee: MoneyOut
    drug_fee: MoneyOut
    total_amount: MoneyOut
    payment_method: str
    payment_status: str
    paid_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    created_at: datetime
    items: list[InvoiceItemOut]
