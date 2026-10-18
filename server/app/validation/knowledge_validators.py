"""Kiểm tra tri thức OKF: định dạng slug (khớp CHECK của CSDL), tồn tại ở bản Active, và cấu trúc
cây ``condition_logic`` của luật (đặc tả chung chốt 18/10, dùng chung cho script nạp OKF và API quản
trị tri thức; khớp ``app/ai/rules/condition_evaluator.py``).
"""
import re
import math
from collections.abc import Iterable
from typing import Annotated, Any

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


# ============================================================================ condition_logic
# Nhóm:  {"op": "AND"|"OR", "args": [nút, ...]}   — không có NOT (phủ định dùng state ABSENT)
# Lá:    {"type": "symptom", "symptom_code": ..., "state": "PRESENT"|"ABSENT"}
#        {"type": "vital", "vital": <khóa trong fn_vital_sign_keys()>, "cmp": ..., "value": số}
#        {"type": "age", "unit": "years"|"months", "cmp": ..., "value": số}
# Gốc được phép là một lá; lồng tối đa MAX_LOGIC_DEPTH tầng; args không rỗng.
MAX_LOGIC_DEPTH = 5
LOGIC_CMPS = ("<", "<=", ">", ">=", "==")
_LEAF_KEYS = {"symptom": {"type", "symptom_code", "state"},
              "vital": {"type", "vital", "cmp", "value"},
              "age": {"type", "unit", "cmp", "value"}}


def condition_logic_errors(logic: Any) -> list[dict[str, str]]:
    """Trả danh sách lỗi [{path, message}] (rỗng = hợp lệ). Không truy cập DB: việc mã triệu chứng
    có trong danh mục Active được kiểm riêng (``logic_symptom_codes`` + ``active_symptoms``)."""
    from app.validation.schema_validators import vital_sign_keys
    vitals = set(vital_sign_keys())
    errors: list[dict[str, str]] = []

    def err(path: str, message: str) -> None:
        errors.append({"path": path, "message": message})

    def number(v) -> bool:
        return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)

    def walk(node: Any, path: str, depth: int) -> None:
        if depth > MAX_LOGIC_DEPTH:
            err(path, f"Lồng quá {MAX_LOGIC_DEPTH} tầng")
            return
        if not isinstance(node, dict):
            err(path, "Mỗi nút phải là object")
            return
        if "op" in node:
            extra = set(node) - {"op", "args"}
            if extra:
                err(path, f"Trường không được phép: {', '.join(sorted(extra))}")
            if node["op"] not in ("AND", "OR"):
                err(f"{path}.op", "Chỉ nhận AND hoặc OR")
            args = node.get("args")
            if not isinstance(args, list) or not args:
                err(f"{path}.args", "args phải là danh sách không rỗng")
                return
            for i, child in enumerate(args):
                walk(child, f"{path}.args[{i}]", depth + 1)
            return
        kind = node.get("type")
        if kind not in _LEAF_KEYS:
            err(f"{path}.type", "Loại lá phải là symptom, vital hoặc age")
            return
        missing, extra = _LEAF_KEYS[kind] - set(node), set(node) - _LEAF_KEYS[kind]
        if missing:
            err(path, f"Thiếu trường: {', '.join(sorted(missing))}")
        if extra:
            err(path, f"Trường không được phép: {', '.join(sorted(extra))}")
        if kind == "symptom":
            code = node.get("symptom_code")
            if not isinstance(code, str) or not SLUG_RE.match(code) or len(code) > SYMPTOM_CODE_MAX:
                err(f"{path}.symptom_code", "Mã triệu chứng không hợp lệ")
            if node.get("state") not in ("PRESENT", "ABSENT"):
                err(f"{path}.state", "Chỉ nhận PRESENT hoặc ABSENT")
            return
        if node.get("cmp") not in LOGIC_CMPS:
            err(f"{path}.cmp", f"Chỉ nhận {' '.join(LOGIC_CMPS)}")
        if not number(node.get("value")):
            err(f"{path}.value", "Phải là số")
        if kind == "vital" and node.get("vital") not in vitals:
            err(f"{path}.vital", "Không phải khóa sinh hiệu chuẩn")
        if kind == "age" and node.get("unit") not in ("years", "months"):
            err(f"{path}.unit", "Chỉ nhận years hoặc months")

    walk(logic, "$", 1)
    return errors


def logic_symptom_codes(logic: Any) -> set[str]:
    """Mọi symptom_code ở mọi độ sâu (giống jsonpath '$.**.symptom_code' của v_knowledge_integrity_issues)."""
    found: set[str] = set()

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for k, v in node.items():
                if k == "symptom_code" and isinstance(v, str):
                    found.add(v)
                else:
                    walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(logic)
    return found


def check_condition_logic(logic: Any) -> Any:
    """Dùng trong schema Pydantic (API quản trị tri thức). Ném ValueError gom mọi lỗi."""
    errors = condition_logic_errors(logic)
    if errors:
        raise ValueError("; ".join(f"{e['path']}: {e['message']}" for e in errors))
    return logic


ConditionLogic = Annotated[dict, AfterValidator(check_condition_logic)]
