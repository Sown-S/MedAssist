"""Sinh hiệu: khoảng nhập liệu, kiểu, khóa lạ, cảnh báo mềm, khớp fn_vital_sign_keys()."""
import math

import pytest
from pydantic import BaseModel, ValidationError
from sqlalchemy import text

from app.core.database import engine
from app.validation.schema_validators import (VitalSigns, vital_sign_keys, vital_sign_warnings,
                                              vital_signs_schema)

NORMAL = {"temperature_c": 37.0, "heart_rate_bpm": 80, "respiratory_rate_bpm": 18,
          "systolic_bp_mmhg": 120, "diastolic_bp_mmhg": 80, "spo2_pct": 98,
          "weight_kg": 60.0, "height_cm": 165.0}


def _messages(exc: ValidationError) -> dict[str, str]:
    return {".".join(map(str, e["loc"])) or "__root__": e["msg"].removeprefix("Value error, ")
            for e in exc.errors()}


def test_schema_keys_match_database_function(users):
    """Quy định v4: JSON Schema, fn_vital_sign_keys() và đặc tả OKF phải cùng một danh sách."""
    with engine.connect() as conn:
        db_keys = conn.scalar(text("select fn_vital_sign_keys()"))
    assert sorted(vital_sign_keys()) == sorted(db_keys)


def test_normal_adult_and_newborn_values_accepted():
    assert VitalSigns(**NORMAL).to_db() == NORMAL
    newborn = {"temperature_c": 36.8, "heart_rate_bpm": 160, "respiratory_rate_bpm": 55,
               "spo2_pct": 95, "weight_kg": 0.9, "height_cm": 35.0}
    assert VitalSigns(**newborn).to_db() == newborn


def test_all_keys_optional_and_missing_is_not_filled():
    assert VitalSigns().to_db() == {}
    assert VitalSigns(spo2_pct=97).to_db() == {"spo2_pct": 97}


def test_rounding_to_one_decimal():
    assert VitalSigns(temperature_c=38.46, weight_kg=12.345).to_db() == {"temperature_c": 38.5,
                                                                          "weight_kg": 12.3}


@pytest.mark.parametrize("key", list(NORMAL))
def test_each_key_rejects_out_of_range(key):
    spec = vital_signs_schema()["properties"][key]
    for bad in (spec["minimum"] - 1, spec["maximum"] + 1):
        with pytest.raises(ValidationError) as exc:
            VitalSigns(**{key: type(NORMAL[key])(bad)})
        msg = _messages(exc.value)[key]
        assert msg.startswith(f"{spec['x-label']} phải từ") and spec["x-unit"] in msg


def test_fahrenheit_typo_gets_hint():
    with pytest.raises(ValidationError) as exc:
        VitalSigns(temperature_c=101.3)
    assert _messages(exc.value)["temperature_c"] == "Nhiệt độ phải từ 30 đến 45 °C (kiểm tra lại có nhập °F không)"


@pytest.mark.parametrize("payload", [
    {"nhiet_do": 38},                     # khóa lạ
    {"heart_rate_bpm": 80.5},             # nhịp tim phải là số nguyên
    {"heart_rate_bpm": True},             # bool không phải số
    {"temperature_c": "38.5"},            # chuỗi không phải số
    {"temperature_c": math.nan},
    {"temperature_c": math.inf},
])
def test_rejects_wrong_types_and_unknown_keys(payload):
    with pytest.raises(ValidationError):
        VitalSigns(**payload)


def test_diastolic_must_be_below_systolic():
    with pytest.raises(ValidationError) as exc:
        VitalSigns(systolic_bp_mmhg=80, diastolic_bp_mmhg=90)
    assert "Huyết áp tâm trương phải nhỏ hơn tâm thu" in str(exc.value)
    assert VitalSigns(diastolic_bp_mmhg=90).to_db() == {"diastolic_bp_mmhg": 90}   # chỉ một trị số: nhận


def test_soft_warnings_are_age_independent():
    assert vital_sign_warnings(VitalSigns(**NORMAL)) == []
    # Nhịp tim 180 / nhịp thở 60 bình thường ở trẻ sơ sinh: KHÔNG cảnh báo
    assert vital_sign_warnings(VitalSigns(heart_rate_bpm=180, respiratory_rate_bpm=60)) == []
    w = vital_sign_warnings(VitalSigns(temperature_c=33.5, spo2_pct=65, systolic_bp_mmhg=230,
                                       diastolic_bp_mmhg=135))
    assert {x["field"] for x in w} == {"vital_signs.temperature_c", "vital_signs.spo2_pct",
                                       "vital_signs.systolic_bp_mmhg", "vital_signs.diastolic_bp_mmhg"}
    assert all(x["code"] == "UNUSUAL_VALUE" for x in w)
    assert vital_sign_warnings(None) == [] and vital_sign_warnings({"spo2_pct": 60})[0]["field"] == "vital_signs.spo2_pct"


def test_api_error_format_for_vitals(client):
    """Qua API: lỗi sinh hiệu ra đúng định dạng lượt 4b, thông báo có đơn vị."""
    from fastapi import APIRouter

    from app.main import app

    class _Body(BaseModel):
        vital_signs: VitalSigns | None = None

    router = APIRouter()

    @router.post("/api/v1/_test/vitals")
    def _endpoint(body: _Body):
        return {"warnings": vital_sign_warnings(body.vital_signs)}

    app.include_router(router)
    r = client.post("/api/v1/_test/vitals", json={"vital_signs": {"spo2_pct": 120, "x": 1}})
    details = {d["field"]: d["message"] for d in r.json()["error"]["details"]}
    assert r.status_code == 422
    assert details["vital_signs.spo2_pct"] == "SpO2 phải từ 50 đến 100 %"
    assert details["vital_signs.x"] == "Trường không được phép"
    ok = client.post("/api/v1/_test/vitals", json={"vital_signs": {"temperature_c": 33}})
    assert ok.status_code == 200 and ok.json()["warnings"][0]["code"] == "UNUSUAL_VALUE"
