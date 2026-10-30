"""Sinh hiệu từ lời kể tổng hợp; không DB/LLM, không tự xác nhận."""

import pytest

from app.ai.extraction.vital_extractor import extract_vitals
from app.validation.schema_validators import vital_signs_schema


@pytest.mark.parametrize("note,expected", [
    ("sốt 39 độ từ tối qua, mạch nhanh", {"temperature_c": 39}),
    ("39°C", {"temperature_c": 39}),
    ("39 độ", {"temperature_c": 39}),
    ("sốt 39,5", {"temperature_c": 39.5}),
    ("nhiệt độ 39.5°C", {"temperature_c": 39.5}),
    ("HA 150/90", {"systolic_bp_mmhg": 150, "diastolic_bp_mmhg": 90}),
    ("huyết áp 150 trên 90", {"systolic_bp_mmhg": 150, "diastolic_bp_mmhg": 90}),
    ("mạch 110", {"heart_rate_bpm": 110}),
    ("nhịp thở 28", {"respiratory_rate_bpm": 28}),
    ("SpO2 92%", {"spo2_pct": 92}),
    ("nặng 60kg", {"weight_kg": 60}),
    ("cao 1m65", {"height_cm": 165}),
    ("cao 1,65m", {"height_cm": 165}),
    ("cao 165cm", {"height_cm": 165}),
    ("cao 1m65, nặng 60kg.", {"height_cm": 165, "weight_kg": 60}),
    ("không sốt, mạch 110, nhịp thở 28.", {"heart_rate_bpm": 110, "respiratory_rate_bpm": 28}),
    ("không sốt nhưng nhiệt độ 39°C", {"temperature_c": 39}),
    ("sot 39,5 do", {"temperature_c": 39.5}),
])
def test_supported_values(note, expected):
    result = extract_vitals(note)
    assert {p["key"]: p["value"] for p in result} == expected
    assert all(p["evidence"] in note for p in result)


@pytest.mark.parametrize("note", [
    "", "39,5", "sốt cao, mạch nhanh", "ba mươi chín độ", "không sốt 39 độ",
    "chưa đo nhiệt độ 39°C", "phủ nhận sốt 39°C", "nhiệt độ 139°C",
    "sốt 29 độ", "sốt 46 độ", "mạch 19", "mạch 251", "mạch 110,5",
    "nhịp thở 3", "nhịp thở 81", "SpO2 49%", "SpO2 101%",
    "nặng 0,4kg", "nặng 301kg", "cao 29cm", "cao 251cm",
    "HA 90/150", "HA 150/150", "HA 150/10", "HA 270/90", "HA 150",
    "sốt 39kg", "nhiệt độ 39°F",
    "hôm qua 39 độ, hiện tại 37 độ", "HA 150/90; HA 120/80",
])
def test_ambiguous_negated_invalid_or_conflicting_values_are_omitted(note):
    assert extract_vitals(note) == []


def test_duplicate_and_evidence_minimization():
    result = extract_vitals("Nguyễn Văn A, sốt 39 độ; sốt 39 độ")
    assert len(result) == 1
    assert result[0]["evidence"] == "sốt 39 độ"


@pytest.mark.parametrize("key,template", [
    ("temperature_c", "sốt {} độ"), ("heart_rate_bpm", "mạch {}"),
    ("respiratory_rate_bpm", "nhịp thở {}"), ("spo2_pct", "SpO2 {}%"),
    ("weight_kg", "nặng {}kg"), ("height_cm", "cao {}cm"),
])
def test_shared_schema_boundaries(key, template):
    spec = vital_signs_schema()["properties"][key]
    for value in (spec["minimum"], spec["maximum"]):
        result = extract_vitals(template.format(value))
        assert result[0]["key"] == key
        assert result[0]["value"] == value


@pytest.mark.parametrize("note", ["HA 50/20", "HA 260/160"])
def test_bp_boundaries(note):
    assert len(extract_vitals(note)) == 2


def test_pure_parser_contract_and_bp_group():
    note = "huyết áp 150/90, sốt 39 độ"
    result = extract_vitals(note)
    assert all(set(p) == {"key", "value", "evidence", "group"} for p in result)
    for proposal in result:
        if proposal["key"] in {"systolic_bp_mmhg", "diastolic_bp_mmhg"}:
            assert proposal["group"] == "blood_pressure"
            assert proposal["evidence"] == "huyết áp 150/90"
        else:
            assert proposal["group"] is None
    result[0]["value"] = -999
    assert extract_vitals(note)[0]["value"] != -999


