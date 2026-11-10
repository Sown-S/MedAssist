"""Kiểu giá trị SYSTEM_SETTING (ERD §2.22)."""

import pytest

from app.exceptions import AppError
from app.validation.settings_validators import default_settings, validate_setting


def test_defaults_are_valid_and_cover_all_keys():
    assert default_settings() == {
        "inventory.near_expiry_days": 90,
        "inventory.min_remaining_shelf_days": 0,
        "clinic.profile": {
            "name": "Phòng khám",
            "address": "",
            "phone": "",
            "email": "",
            "tax_code": "",
            "license_no": "",
            "license_date": "",
            "license_issuer": "",
            "director": "",
            "director_license": "",
            "logo": "",
            "print_header": "",
            "print_footer": "",
            "show_logo": True,
        },
        "billing.default_consultation_fee": 0,
        "billing.consultation_service_code": "DV01",
        "security.idle_logout_minutes": 15,
        "alerts.cluster": {"window_days": 7, "min_cases": 5, "ratio": 2.0},
    }


@pytest.mark.parametrize(
    "key, value, expected",
    [
        ("inventory.near_expiry_days", 30, 30),
        ("billing.default_consultation_fee", 150_000, 150_000),
        ("billing.consultation_service_code", "", ""),
        (
            "clinic.profile",
            {"name": "  PK Hòa Khánh ", "phone": "0236"},
            {
                "name": "PK Hòa Khánh",
                "address": "",
                "phone": "0236",
                "email": "",
                "tax_code": "",
                "license_no": "",
                "license_date": "",
                "license_issuer": "",
                "director": "",
                "director_license": "",
                "logo": "",
                "print_header": "",
                "print_footer": "",
                "show_logo": True,
            },
        ),
        ("security.idle_logout_minutes", 0, 0),
        ("security.idle_logout_minutes", 480, 480),
    ],
)
def test_valid_values(key, value, expected):
    assert validate_setting(key, value) == expected


@pytest.mark.parametrize(
    "key, value",
    [
        ("inventory.near_expiry_days", -1),
        ("inventory.near_expiry_days", 400),
        ("inventory.near_expiry_days", "90"),
        ("inventory.near_expiry_days", 9.5),
        ("billing.default_consultation_fee", -1000),
        ("billing.default_consultation_fee", True),
        ("clinic.profile", {"address": "x"}),
        ("clinic.profile", {"name": "A", "logo": "x"}),
        ("clinic.profile", {"name": "A", "logo": "data:image/svg+xml;base64,PHN2Zz4="}),
        ("clinic.profile", {"name": "A", "tax_code": "MST 0401"}),
        ("clinic.profile", {"name": "A", "fax": "0236"}),
        ("clinic.profile", {"name": "A", "print_footer": "x" * 501}),
        ("clinic.profile", {"name": "A", "show_logo": "có"}),
        ("security.idle_logout_minutes", -1),
        ("security.idle_logout_minutes", 481),
        ("security.idle_logout_minutes", "15"),
        ("clinic.profile", "PK A"),
        ("billing.consultation_service_code", "DV 01"),
        ("billing.consultation_service_code", 1),
        ("alerts.cluster", {"window_days": 0, "min_cases": 5, "ratio": 2}),
        ("alerts.cluster", {"window_days": 7, "min_cases": 1, "ratio": 2}),
        ("alerts.cluster", {"window_days": 7, "min_cases": 5, "ratio": 0.5}),
        ("alerts.cluster", {"window_days": 7, "min_cases": 5}),
        ("alerts.cluster", {"window_days": 7, "min_cases": 5, "ratio": 2, "x": 1}),
    ],
)
def test_invalid_values(key, value):
    with pytest.raises(AppError) as exc:
        validate_setting(key, value)
    assert exc.value.code == "VALIDATION_ERROR" and exc.value.details
    assert all(d["field"].startswith(key) for d in exc.value.details)


def test_unknown_key():
    with pytest.raises(AppError) as exc:
        validate_setting("khong.ton_tai", 1)
    assert exc.value.code == "UNKNOWN_SETTING"
