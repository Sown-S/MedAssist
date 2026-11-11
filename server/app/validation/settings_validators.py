"""Kiểm tra kiểu giá trị SYSTEM_SETTING trước khi lưu (ERD §2.22).
Mỗi khóa có một model Pydantic bọc trường `value`; khóa lạ bị từ chối. Thêm khóa mới = thêm vào
SETTINGS (kèm mặc định) trong cùng PR với chỗ code đọc khóa đó.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.exceptions import AppError


class ClinicProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default="", max_length=255)
    phone: str = Field(default="", max_length=20)
    email: str = Field(default="", max_length=100)
    tax_code: str = Field(default="", max_length=20, pattern=r"^[0-9-]*$")
    license_no: str = Field(default="", max_length=50)
    license_date: str = Field(default="", max_length=20)
    license_issuer: str = Field(default="", max_length=200)
    director: str = Field(default="", max_length=100)
    director_license: str = Field(default="", max_length=50)
    # Logo in trên phiếu: data URL ảnh nhỏ, giới hạn để dòng JSONB không phình
    logo: str = Field(default="", max_length=300_000, pattern=r"^(data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)?$")
    # Phần in giống nhau trên mọi máy; khổ giấy theo máy in nên vẫn để client lưu riêng
    print_header: str = Field(default="", max_length=500)
    print_footer: str = Field(default="", max_length=500)
    show_logo: bool = True


class _NearExpiryDays(BaseModel):
    value: int = Field(ge=0, le=365, strict=True)


class _MinRemainingShelfDays(BaseModel):
    value: int = Field(ge=0, le=365, strict=True)


class _ClinicProfile(BaseModel):
    value: ClinicProfile


class _ConsultationFee(BaseModel):
    value: int = Field(ge=0, le=100_000_000, strict=True)  # VNĐ, số nguyên


class _IdleLogoutMinutes(BaseModel):
    value: int = Field(ge=0, le=480, strict=True)  # 0 = không tự đăng xuất


class ClusterAlerts(BaseModel):
    model_config = ConfigDict(extra="forbid")
    window_days: int = Field(ge=1, le=30, strict=True)
    min_cases: int = Field(ge=2, le=1000, strict=True)
    ratio: float = Field(ge=1, le=10)


class _ClusterAlerts(BaseModel):
    value: ClusterAlerts


class _ConsultationServiceCode(BaseModel):
    value: str = Field(max_length=20, pattern=r"^[A-Za-z0-9_-]*$")  # rỗng = dùng phí khám mặc định


SETTINGS: dict[str, tuple[type[BaseModel], Any, str]] = {
    "inventory.near_expiry_days": (
        _NearExpiryDays,
        90,
        "Lô còn hạn nhưng hết hạn trong N ngày thì cảnh báo NearExpiry",
    ),
    "inventory.min_remaining_shelf_days": (
        _MinRemainingShelfDays,
        0,
        "Số ngày hạn tối thiểu còn lại sau khi dùng hết liệu trình",
    ),
    "clinic.profile": (
        _ClinicProfile,
        {"name": "Phòng khám", "address": "", "phone": ""},
        "Thông tin in trên hóa đơn/phiếu khám",
    ),
    "billing.default_consultation_fee": (_ConsultationFee, 0, "Phí khám mặc định (VNĐ)"),
    "billing.consultation_service_code": (
        _ConsultationServiceCode,
        "DV01",
        "Mã dịch vụ khám trong danh mục làm dòng phí khám; rỗng hoặc ngừng dùng thì dùng phí khám mặc định",
    ),
    "security.idle_logout_minutes": (
        _IdleLogoutMinutes,
        15,
        "Số phút không thao tác thì client tự đăng xuất; 0 = tắt",
    ),
    "alerts.cluster": (
        _ClusterAlerts,
        {"window_days": 7, "min_cases": 5, "ratio": 2.0},
        "Cảnh báo cụm ca: trong N ngày có ít nhất M bệnh nhân cùng chẩn đoán/triệu chứng và gấp R lần "
        "trung bình các kỳ N ngày trước",
    ),
}


def validate_setting(key: str, value: Any) -> Any:
    """Trả giá trị đã chuẩn hóa (để lưu JSONB) hoặc ném AppError 422 có details tiếng Việt."""
    entry = SETTINGS.get(key)
    if entry is None:
        raise AppError(
            422,
            "UNKNOWN_SETTING",
            f"Không có tham số '{key}'",
            [{"field": "setting_key", "message": "Khóa không được hỗ trợ"}],
        )
    model = entry[0]
    try:
        parsed = model.model_validate({"value": value})
    except ValidationError as exc:
        from app.exceptions import _validation_details  # dùng chung bộ dịch thông báo

        details = _validation_details(exc.errors())
        for d in details:
            d["field"] = d["field"].replace("value", key, 1)
        raise AppError(422, "VALIDATION_ERROR", "Giá trị tham số không hợp lệ", details) from None
    v = parsed.value
    return v.model_dump() if isinstance(v, BaseModel) else v


def default_settings() -> dict[str, Any]:
    """Giá trị mặc định cho script seed."""
    return {k: validate_setting(k, d) for k, (_, d, _) in SETTINGS.items()}
