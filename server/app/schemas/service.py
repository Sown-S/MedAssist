"""Danh mục dịch vụ, gói khám, phiếu chỉ định cận lâm sàng (ERD v2.1)."""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, model_validator

from app.schemas.common import CleanStr
from app.schemas.inventory import Money, MoneyOut

Code = Annotated[str, Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")]
GroupKey = Annotated[str, Field(min_length=1, max_length=30, pattern=r"^[a-z0-9_]+$")]
RefValue = Annotated[Decimal, Field(max_digits=12, decimal_places=3)]
RefOut = Annotated[Decimal, PlainSerializer(lambda v: int(v) if v == v.to_integral_value() else float(v),
                                            return_type=int | float)]


class _RefRange(BaseModel):
    @model_validator(mode="after")
    def _range(self):
        low, high = getattr(self, "ref_low", None), getattr(self, "ref_high", None)
        if low is not None and high is not None and low > high:
            raise ValueError("Giá trị tham chiếu dưới phải nhỏ hơn hoặc bằng giá trị trên")
        return self


class ServiceCreate(_RefRange):
    model_config = ConfigDict(extra="forbid")
    code: Code
    name: CleanStr = Field(min_length=1, max_length=150)
    kind: Literal["Service", "Lab"]
    group_key: GroupKey = Field(description="Service: consult/procedure/injection/diagnostic; Lab: hematology/biochemistry/...")
    unit: CleanStr | None = Field(default=None, max_length=30)
    price: Money
    ref_low: RefValue | None = None
    ref_high: RefValue | None = None
    ref_text: CleanStr | None = Field(default=None, max_length=100)
    sample: CleanStr | None = Field(default=None, max_length=20)


class ServiceUpdate(_RefRange):
    """Không đổi được mã và loại. Bỏ trống một trường = giữ nguyên."""
    model_config = ConfigDict(extra="forbid")
    name: CleanStr | None = Field(default=None, min_length=1, max_length=150)
    group_key: GroupKey | None = None
    unit: CleanStr | None = Field(default=None, max_length=30)
    price: Money | None = None
    ref_low: RefValue | None = None
    ref_high: RefValue | None = None
    ref_text: CleanStr | None = Field(default=None, max_length=100)
    sample: CleanStr | None = Field(default=None, max_length=20)
    is_active: bool | None = None


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    service_id: uuid.UUID
    code: str
    name: str
    kind: str
    group_key: str
    unit: str | None
    price: MoneyOut
    ref_low: RefOut | None
    ref_high: RefOut | None
    ref_text: str | None
    sample: str | None
    is_active: bool
    updated_at: datetime


class PriceChange(BaseModel):
    price: MoneyOut | None
    old_price: MoneyOut | None
    changed_at: datetime
    changed_by_name: str | None


class PackageItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    service_id: uuid.UUID
    quantity: int = Field(default=1, gt=0, le=100)


class PackageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: Code
    name: CleanStr = Field(min_length=1, max_length=150)
    price: Money
    items: list[PackageItemIn] = Field(min_length=1, max_length=50)


class PackageUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: CleanStr | None = Field(default=None, min_length=1, max_length=150)
    price: Money | None = None
    items: list[PackageItemIn] | None = Field(default=None, min_length=1, max_length=50)
    is_active: bool | None = None


class PackageItemOut(BaseModel):
    service_id: uuid.UUID
    code: str
    name: str
    kind: str
    quantity: int
    is_active: bool


class PackageOut(BaseModel):
    package_id: uuid.UUID
    code: str
    name: str
    price: MoneyOut
    is_active: bool
    items: list[PackageItemOut]
    updated_at: datetime


# ---------------------------------------------------------------------------- phiếu chỉ định
class ServiceOrderCreate(BaseModel):
    """Chọn từ danh mục (service_ids), một gói (package_id) và/hoặc gõ tên ngoài danh mục (other_items)."""
    model_config = ConfigDict(extra="forbid")
    service_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    package_id: uuid.UUID | None = None
    other_items: list[Annotated[CleanStr, Field(min_length=1, max_length=150)]] = Field(default_factory=list,
                                                                                          max_length=10)
    diagnosis: CleanStr | None = Field(default=None, max_length=500)
    note: CleanStr | None = Field(default=None, max_length=500)
    send_out: bool = Field(default=True, description="Đồng thời đánh dấu bệnh nhân đi xét nghiệm (lab_out_at)")

    @model_validator(mode="after")
    def _not_empty(self):
        if not self.service_ids and self.package_id is None and not self.other_items:
            raise ValueError("Chọn ít nhất một dịch vụ, một gói hoặc nhập tên chỉ định ngoài danh mục")
        return self


class ItemResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_id: uuid.UUID
    result: CleanStr | None = Field(max_length=2000, description="Chuỗi rỗng hoặc null = xóa kết quả")


class OrderConclusion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    order_id: uuid.UUID
    conclusion: CleanStr | None = Field(max_length=2000)


class ResultsPut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[ItemResult] = Field(default_factory=list, max_length=100)
    conclusions: list[OrderConclusion] = Field(default_factory=list, max_length=20)


class CancelItemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: CleanStr = Field(min_length=3, max_length=500)


class ServiceOrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    item_id: uuid.UUID
    service_id: uuid.UUID | None
    service_code: str | None = None
    item_name: str
    quantity: int
    unit_price: MoneyOut | None
    in_package: bool
    status: str
    result: str | None
    result_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    unit: str | None = None
    ref_low: RefOut | None = None
    ref_high: RefOut | None = None
    ref_text: str | None = None
    sample: str | None = None


class ServiceOrderOut(BaseModel):
    order_id: uuid.UUID
    visit_id: uuid.UUID
    ordered_at: datetime
    ordered_by: uuid.UUID
    ordered_by_name: str | None
    package_id: uuid.UUID | None
    package_name: str | None
    package_price: MoneyOut | None
    diagnosis: str | None
    note: str | None
    conclusion: str | None
    items: list[ServiceOrderItemOut]


class UnbilledOrderItem(BaseModel):
    """Chỉ định ngoài danh mục: chưa có giá nên không tự vào hóa đơn, quầy thêm tay."""
    item_id: uuid.UUID
    order_id: uuid.UUID
    item_name: str
    quantity: int
