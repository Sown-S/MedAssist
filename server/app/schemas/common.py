"""Kiểu dữ liệu dùng chung cho schema request/response."""
import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator

_SPACES = re.compile(r"\s+")


def _clean_text(v):
    """Bỏ khoảng trắng đầu/cuối và gộp khoảng trắng liên tiếp (họ tên, địa chỉ)."""
    return _SPACES.sub(" ", v).strip() if isinstance(v, str) else v


def _phone_vn(v: str) -> str:
    digits = re.sub(r"[\s.\-()]", "", v)
    if digits.startswith("+84"):
        digits = "0" + digits[3:]
    elif digits.startswith("84") and len(digits) == 11:
        digits = "0" + digits[2:]
    if not re.fullmatch(r"0\d{9}", digits):
        raise ValueError("Số điện thoại phải có 10 chữ số, bắt đầu bằng 0 (hoặc +84)")
    return digits


def _empty_to_none(v):
    return None if isinstance(v, str) and not v.strip() else v


CleanStr = Annotated[str, BeforeValidator(_clean_text)]
PhoneVN = Annotated[str, BeforeValidator(_empty_to_none), AfterValidator(_phone_vn)]


class Page[T](BaseModel):
    total: int
    limit: int
    offset: int
    items: list[T]
