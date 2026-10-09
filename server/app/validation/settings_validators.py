"""Kiểm tra kiểu giá trị SYSTEM_SETTING trước khi lưu (ERD v1.8 mục 2.22).

Mỗi khóa có một model Pydantic bọc trường `value`. Khóa lạ bị từ chối: thêm khóa mới = thêm vào
SETTINGS ở đây (kèm mặc định) trong cùng PR với chỗ code đọc khóa đó.
"""
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.exceptions import AppError


class ClinicProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default="", max_length=255)
    phone: str = Field(default="", max_length=20)


class _NearExpiryDays(BaseModel):
    value: int = Field(ge=0, le=365, strict=True)


class _MinRemainingShelfDays(BaseModel):
    value: int = Field(ge=0, le=365, strict=True)


class _ClinicProfile(BaseModel):
    value: ClinicProfile


class _ConsultationFee(BaseModel):
    value: int = Field(ge=0, le=100_000_000, strict=True)     # VNĐ, số nguyên


SETTINGS: dict[str, tuple[type[BaseModel], Any, str]] = {
    "inventory.near_expiry_days": (_NearExpiryDays, 90,
                                   "Lô còn hạn nhưng hết hạn trong N ngày thì cảnh báo NearExpiry"),
    "inventory.min_remaining_shelf_days": (_MinRemainingShelfDays, 0,
                                           "Số ngày hạn tối thiểu còn lại sau khi dùng hết liệu trình"),
    "clinic.profile": (_ClinicProfile, {"name": "Phòng khám", "address": "", "phone": ""},
                       "Thông tin in trên hóa đơn/phiếu khám"),
    "billing.default_consultation_fee": (_ConsultationFee, 0, "Phí khám mặc định (VNĐ)"),
}


def validate_setting(key: str, value: Any) -> Any:
    """Trả giá trị đã chuẩn hóa (để lưu JSONB) hoặc ném AppError 422 có details tiếng Việt."""
    entry = SETTINGS.get(key)
    if entry is None:
        raise AppError(422, "UNKNOWN_SETTING", f"Không có tham số '{key}'",
                       [{"field": "setting_key", "message": "Khóa không được hỗ trợ"}])
    model = entry[0]
    try:
        parsed = model.model_validate({"value": value})
    except ValidationError as exc:
        from app.exceptions import _validation_details   # dùng chung bộ dịch thông báo
        details = _validation_details(exc.errors())
        for d in details:
            d["field"] = d["field"].replace("value", key, 1)
        raise AppError(422, "VALIDATION_ERROR", "Giá trị tham số không hợp lệ", details) from None
    v = parsed.value
    return v.model_dump() if isinstance(v, BaseModel) else v


def default_settings() -> dict[str, Any]:
    """Giá trị mặc định cho script seed (Sprint 3)."""
    return {k: validate_setting(k, d) for k, (_, d, _) in SETTINGS.items()}
