"""Mã OKF: định dạng slug và kiểm tra tồn tại ở bản Active."""
import datetime

import pytest
from pydantic import BaseModel, ValidationError

from app.core.database import SessionLocal
from app.exceptions import AppError
from app.models import KnowledgeRelease, Symptom
from app.validation.knowledge_validators import (ConditionCode, SymptomCode, active_condition_codes,
                                                 active_symptoms, check_rule_key)


class _M(BaseModel):
    s: SymptomCode | None = None
    c: ConditionCode | None = None


@pytest.mark.parametrize("code", ["fever_high", "ho", "dau_nguc_2", "a1"])
def test_valid_slugs(code):
    assert _M(s=code, c=code).s == code


@pytest.mark.parametrize("code", ["Fever", "fever-high", "fever__high", "_fever", "fever_", "sốt",
                                  "fever high", "", "a" * 51])
def test_invalid_symptom_codes(code):
    with pytest.raises(ValidationError):
        _M(s=code)


def test_condition_code_allows_80_chars():
    assert _M(c="a" * 80).c == "a" * 80
    with pytest.raises(ValidationError):
        _M(c="a" * 81)


@pytest.mark.parametrize("key, rule_type, ok", [
    ("rf_kho_tho_nang", "RED_FLAG", True), ("pf_sot_cao_tre_nho", "PRIORITY_FLOOR", True),
    ("pf_kho_tho", "RED_FLAG", False), ("kho_tho", "RED_FLAG", False), ("rf_x", "OTHER", False),
])
def test_rule_key_prefix(key, rule_type, ok):
    if ok:
        assert check_rule_key(key, rule_type) == key
    else:
        with pytest.raises(ValueError):
            check_rule_key(key, rule_type)


def test_active_symptoms_lookup(users):
    """Dữ liệu tri thức tạo trong transaction rồi rollback: không để lại gì trong medassist_test."""
    with SessionLocal() as db:
        rel = KnowledgeRelease(label="TEST-KB", status="Active", created_by=users["admin"].user_id,
                               approved_by=users["bs"].user_id,
                               approved_at=datetime.datetime.now(datetime.UTC))
        db.add(rel)
        db.flush()
        for code, status in (("sot_cao", "Active"), ("ho_khan", "Active"), ("cu", "Retired")):
            db.add(Symptom(symptom_code=code, symptom_name=code, status=status,
                           release_id=rel.release_id, created_by=users["admin"].user_id))
        db.flush()

        found = active_symptoms(db, ["sot_cao", "ho_khan", "sot_cao"])
        assert set(found) == {"sot_cao", "ho_khan"} and found["sot_cao"].status == "Active"
        assert active_symptoms(db, []) == {}

        with pytest.raises(AppError) as exc:
            active_symptoms(db, ["sot_cao", "cu", "khong_co"])
        assert exc.value.code == "UNKNOWN_SYMPTOM" and exc.value.status_code == 422
        assert [d["value"] for d in exc.value.details] == ["cu", "khong_co"]

        with pytest.raises(AppError) as exc:
            active_condition_codes(db, ["viem_phoi"])
        assert exc.value.code == "UNKNOWN_CONDITION"
        db.rollback()
