import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import CleanStr
from app.schemas.inventory import MoneyOut


class PrescriptionItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    drug_id: uuid.UUID
    dosage: CleanStr = Field(min_length=1, max_length=100, description="Liều mỗi lần, vd '1 viên'")
    frequency: CleanStr = Field(min_length=1, max_length=100, description="Số lần, vd '3 lần/ngày sau ăn'")
    duration_days: int = Field(gt=0, le=365, description="Số ngày dùng — dùng để chọn lô đủ hạn")
    quantity: int = Field(gt=0, le=10_000, description="Tổng số lượng theo đơn vị nhỏ nhất của thuốc")
    instruction: str | None = Field(default=None, max_length=1000)


class PrescriptionDraft(BaseModel):
    """Ghi đè toàn bộ đơn nháp (đơn nháp cũ được hủy, giữ lại làm lịch sử)."""
    model_config = ConfigDict(extra="forbid")
    items: list[PrescriptionItemIn] = Field(min_length=1, max_length=30)


class PrescriptionItemOut(BaseModel):
    item_id: uuid.UUID
    drug_id: uuid.UUID
    drug_name: str
    unit: str
    dosage: str
    frequency: str
    duration_days: int
    quantity: int
    instruction: str | None
    dispense_status: str
    skip_reason: str | None
    unit_price: MoneyOut
    usable_quantity: int | None = None   # tồn đủ hạn cho liệu trình (chỉ khi đơn còn Draft)


class PatientContext(BaseModel):
    """Khung nhắc khi kê đơn — CHỈ ĐỌC. Hệ thống KHÔNG kiểm tra tương tác thuốc."""
    chronic_conditions: list[str] = []
    medical_notes: str | None = None
    allergy_notes: str | None = None
    disclaimer: str = "Hệ thống không kiểm tra tương tác thuốc. Bác sĩ tự đối chiếu bệnh nền và dị ứng."


class PrescriptionOut(BaseModel):
    prescription_id: uuid.UUID | None
    visit_id: uuid.UUID
    status: str | None                    # None = chưa có đơn
    confirmed_at: datetime | None = None
    items: list[PrescriptionItemOut] = []
    patient_context: PatientContext


class ReopenRequest(BaseModel):
    reason: CleanStr = Field(min_length=3, max_length=500)
