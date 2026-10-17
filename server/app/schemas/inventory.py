import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, PlainSerializer

from app.schemas.common import CleanStr

def _to_number(v: Decimal) -> int | float:
    """Tiền ra JSON dạng số: 1500.00 -> 1500 (VNĐ), 1500.50 -> 1500.5."""
    return int(v) if v == v.to_integral_value() else float(v)


# Vào: tối đa 12 chữ số, 2 chữ số thập phân, chuẩn hóa về 2 chữ số (khớp DECIMAL(12,2)). Ra: số JSON.
Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2),
                  AfterValidator(lambda v: v.quantize(Decimal("0.01")))]
MoneyOut = Annotated[Decimal, PlainSerializer(_to_number, return_type=int | float)]
ReasonCode = Literal["Expired", "Damaged", "Lost", "CountCorrection", "Other"]
BatchStatus = Literal["Usable", "NearExpiry", "Expired", "Depleted"]


class DrugCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    generic_name: CleanStr = Field(min_length=1, max_length=150, description="Tên hoạt chất, vd Paracetamol")
    trade_name: CleanStr = Field(min_length=1, max_length=150, description="Tên thương mại, vd Panadol")
    strength: CleanStr = Field(min_length=1, max_length=50, description="Hàm lượng, vd 500 mg")
    dosage_form: CleanStr = Field(min_length=1, max_length=50, description="Dạng bào chế, vd viên nén")
    unit: CleanStr = Field(min_length=1, max_length=30, description="Đơn vị xuất bán nhỏ nhất, vd viên")
    sale_price: Money
    reorder_level: int = Field(default=0, ge=0, le=1_000_000)
    drug_class: CleanStr | None = Field(default=None, max_length=100)
    active_ingredient_code: CleanStr | None = Field(default=None, max_length=50)


class DrugUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    generic_name: CleanStr | None = Field(default=None, min_length=1, max_length=150)
    trade_name: CleanStr | None = Field(default=None, min_length=1, max_length=150)
    strength: CleanStr | None = Field(default=None, min_length=1, max_length=50)
    dosage_form: CleanStr | None = Field(default=None, min_length=1, max_length=50)
    unit: CleanStr | None = Field(default=None, min_length=1, max_length=30)
    sale_price: Money | None = None
    reorder_level: int | None = Field(default=None, ge=0, le=1_000_000)
    drug_class: CleanStr | None = Field(default=None, max_length=100)
    active_ingredient_code: CleanStr | None = Field(default=None, max_length=50)
    is_active: bool | None = None


class DrugOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    drug_id: uuid.UUID
    generic_name: str
    trade_name: str
    strength: str
    dosage_form: str
    unit: str
    sale_price: MoneyOut
    reorder_level: int
    drug_class: str | None
    active_ingredient_code: str | None
    is_active: bool


class DrugStockOut(BaseModel):
    """Một dòng v_drug_stock: tồn dùng được / sắp hết hạn / đã hết hạn, cờ tồn thấp."""
    drug_id: uuid.UUID
    generic_name: str
    strength: str
    unit: str
    reorder_level: int
    usable_quantity: int
    near_expiry_quantity: int
    expired_quantity: int
    nearest_expiry: date | None
    is_low_stock: bool


class BatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    drug_id: uuid.UUID
    batch_number: CleanStr = Field(min_length=1, max_length=50)
    expiry_date: date
    manufacturing_date: date | None = None
    quantity: int = Field(gt=0, le=10_000_000, description="Số lượng theo đơn vị nhỏ nhất của thuốc")
    import_price: Money


class BatchTopUp(BaseModel):
    """Nhập thêm vào lô đã có (cùng số lô, cùng hạn) = Adjustment dương (quy ước ERD v1.8)."""
    model_config = ConfigDict(extra="forbid")
    quantity: int = Field(gt=0, le=10_000_000)
    note: CleanStr | None = Field(default=None, max_length=500)


class AdjustmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quantity_change: int = Field(ge=-10_000_000, le=10_000_000, description="Âm = giảm (hủy, mất), dương = tăng (kiểm kê thừa)")
    reason_code: ReasonCode
    note: CleanStr | None = Field(default=None, max_length=500)


class BatchOut(BaseModel):
    batch_id: uuid.UUID
    drug_id: uuid.UUID
    batch_number: str
    expiry_date: date
    manufacturing_date: date | None
    initial_quantity: int
    remaining_quantity: int
    import_price: MoneyOut
    created_at: datetime
    batch_status: BatchStatus
    days_to_expiry: int


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    movement_id: uuid.UUID
    batch_id: uuid.UUID
    movement_type: str
    quantity_change: int
    reason_code: str | None
    note: str | None
    prescription_item_id: uuid.UUID | None
    performed_by: uuid.UUID
    created_at: datetime


class InventoryAlerts(BaseModel):
    low_stock: list[DrugStockOut]
    near_expiry: list[BatchOut]
    expired_with_stock: list[BatchOut]


class SettingOut(BaseModel):
    setting_key: str
    value: object
    description: str
    is_default: bool
    updated_by: uuid.UUID | None = None
    updated_at: datetime | None = None


class SettingUpdate(BaseModel):
    value: object
