"""Kiểu giá trị SYSTEM_SETTING (ERD v1.8 mục 2.22)."""
import pytest

from app.exceptions import AppError
from app.validation.settings_validators import default_settings, validate_setting


def test_defaults_are_valid_and_cover_all_keys():
    assert default_settings() == {
        "inventory.near_expiry_days": 90, "inventory.min_remaining_shelf_days": 0,
        "clinic.profile": {"name": "Phòng khám", "address": "", "phone": ""},
        "billing.default_consultation_fee": 0}


@pytest.mark.parametrize("key, value, expected", [
    ("inventory.near_expiry_days", 30, 30),
    ("billing.default_consultation_fee", 150_000, 150_000),
    ("clinic.profile", {"name": "  PK Hòa Khánh ", "phone": "0236"},
     {"name": "PK Hòa Khánh", "address": "", "phone": "0236"}),
])
def test_valid_values(key, value, expected):
    assert validate_setting(key, value) == expected


@pytest.mark.parametrize("key, value", [
    ("inventory.near_expiry_days", -1), ("inventory.near_expiry_days", 400),
    ("inventory.near_expiry_days", "90"), ("inventory.near_expiry_days", 9.5),
    ("billing.default_consultation_fee", -1000), ("billing.default_consultation_fee", True),
    ("clinic.profile", {"address": "x"}), ("clinic.profile", {"name": "A", "logo": "x"}),
    ("clinic.profile", "PK A"),
])
def test_invalid_values(key, value):
    with pytest.raises(AppError) as exc:
        validate_setting(key, value)
    assert exc.value.code == "VALIDATION_ERROR" and exc.value.details
    assert all(d["field"].startswith(key) for d in exc.value.details)


def test_unknown_key():
    with pytest.raises(AppError) as exc:
        validate_setting("khong.ton_tai", 1)
    assert exc.value.code == "UNKNOWN_SETTING"
