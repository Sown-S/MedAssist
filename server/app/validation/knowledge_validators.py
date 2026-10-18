"""Kiểm tra mã tri thức OKF: định dạng slug (khớp CHECK của CSDL) và tồn tại ở bản Active.

Validator condition_logic (cây AND/OR của luật) làm ở Sprint 3, khi có knowledge/_spec/okf_format.md.
"""
import re
from collections.abc import Iterable
from typing import Annotated

from pydantic import AfterValidator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.exceptions import AppError
from app.models import Condition, Symptom

SLUG_RE = re.compile(r"^[a-z0-9]+(_[a-z0-9]+)*$")      # = chk_*_format trong medassist_schema_v1_8.sql
SYMPTOM_CODE_MAX = 50                                   # symptom_key.symptom_code VARCHAR(50)
CONDITION_CODE_MAX = 80                                 # condition_key.condition_code VARCHAR(80)
SLUG_KEY_MAX = 80                                       # rule_key, excerpt_key VARCHAR(80)
RULE_PREFIX = {"RED_FLAG": "rf_", "PRIORITY_FLOOR": "pf_"}


def _slug_checker(label: str, max_len: int):
    def check(v: str) -> str:
        if len(v) > max_len:
            raise ValueError(f"{label} tối đa {max_len} ký tự")
        if not SLUG_RE.match(v):
            raise ValueError(f"{label} chỉ gồm chữ thường không dấu, số và dấu gạch dưới "
                             f"giữa các từ (vd fever_high)")
        return v
    return check


SymptomCode = Annotated[str, AfterValidator(_slug_checker("Mã triệu chứng", SYMPTOM_CODE_MAX))]
ConditionCode = Annotated[str, AfterValidator(_slug_checker("Mã bệnh", CONDITION_CODE_MAX))]
ExcerptKey = Annotated[str, AfterValidator(_slug_checker("Mã khuyến cáo", SLUG_KEY_MAX))]


def check_rule_key(rule_key: str, rule_type: str) -> str:
    """rule_key là slug và có tiền tố đúng loại luật (chk_triage_rule_key_format)."""
    _slug_checker("Mã luật", SLUG_KEY_MAX)(rule_key)
    prefix = RULE_PREFIX.get(rule_type)
    if prefix is None:
        raise ValueError(f"Loại luật không hợp lệ: {rule_type}")
    if not rule_key.startswith(prefix):
        raise ValueError(f"Luật {rule_type} phải có mã bắt đầu bằng '{prefix}'")
    return rule_key


def active_symptoms(db: Session, codes: Iterable[str]) -> dict[str, Symptom]:
    """Trả {mã: dòng Active}. Mã không có ở bản Active -> AppError 422 UNKNOWN_SYMPTOM, liệt kê
    từng mã sai, để Nurse sửa trước khi lưu (US12: chỉ mã đã xác nhận mới vào pipeline)."""
    wanted = list(dict.fromkeys(codes))
    if not wanted:
        return {}
    rows = db.scalars(select(Symptom).where(Symptom.symptom_code.in_(wanted),
                                            Symptom.status == "Active")).all()
    found = {s.symptom_code: s for s in rows}
    missing = [c for c in wanted if c not in found]
    if missing:
        raise AppError(422, "UNKNOWN_SYMPTOM", "Có mã triệu chứng không có trong danh mục đang dùng",
                       [{"field": "symptom_code", "value": c,
                         "message": "Không có hoặc đã ngừng dùng"} for c in missing])
    return found


def active_condition_codes(db: Session, codes: Iterable[str]) -> set[str]:
    """Như trên cho mã bệnh (danh sách bệnh hợp lệ — US02, Node 4)."""
    wanted = list(dict.fromkeys(codes))
    if not wanted:
        return set()
    found = set(db.scalars(select(Condition.condition_code).where(
        Condition.condition_code.in_(wanted), Condition.status == "Active")).all())
    missing = [c for c in wanted if c not in found]
    if missing:
        raise AppError(422, "UNKNOWN_CONDITION", "Có mã bệnh không có trong danh sách đang dùng",
                       [{"field": "condition_code", "value": c,
                         "message": "Không có hoặc đã ngừng dùng"} for c in missing])
    return found
