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


from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.schemas.common import CleanStr
from app.schemas.inventory import Money


class DispenseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["Dispensed", "Skipped"]
    skip_reason: CleanStr | None = Field(default=None, min_length=3, max_length=500)


class ParaclinicalLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_name: CleanStr = Field(min_length=1, max_length=150, description="vd Siêu âm bụng, Công thức máu")
    quantity: int = Field(default=1, gt=0, le=100)
    unit_price: Money


class InvoiceEdit(BaseModel):
    """Bỏ trống một trường = giữ nguyên. paraclinical_items = danh sách MỚI thay toàn bộ dòng nhập tay."""
    model_config = ConfigDict(extra="forbid")
    consultation_fee: Money | None = None
    paraclinical_items: list[ParaclinicalLine] | None = Field(default=None, max_length=30)


class PaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payment_method: Literal["Cash", "BankingTransfer"] = "Cash"


class BillingResult(BaseModel):
    """Kết quả cấp phát / thu tiền: lượt khám đã kết thúc chưa, hóa đơn hiện tại."""
    visit_finished: bool
    invoice: InvoiceOut | None


class AwaitingPaymentItem(BaseModel):
    visit_id: uuid.UUID
    queue_number: int | None
    patient_name: str
    invoice_code: str | None
    total_amount: MoneyOut | None
    payment_status: str | None
    has_prescription: bool
    pending_items: int


class PrintPatient(BaseModel):
    full_name: str
    date_of_birth: object
    gender: str


class InvoicePrint(BaseModel):
    clinic: dict
    patient: PrintPatient
    physician_name: str | None
    visit_date: datetime
    invoice: InvoiceOut
