"""Kiểm tra định dạng / schema dùng chung. Hiện có: sinh hiệu (visit.vital_signs).

Dùng trong schema request:
    from app.validation.schema_validators import VitalSigns
    class VisitCreate(BaseModel):
        vital_signs: VitalSigns | None = None

    # sau khi nhận: cảnh báo mềm để trả kèm phản hồi
    warnings = vital_sign_warnings(body.vital_signs)

Lưu vào DB: body.vital_signs.to_db()  -> dict chỉ gồm khóa có giá trị (khóa thiếu = UNKNOWN,
không bao giờ điền mặc định).
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, create_model, model_validator

SCHEMA_DIR = Path(__file__).resolve().parent / "schemas"


@lru_cache
def vital_signs_schema() -> dict[str, Any]:
    return json.loads((SCHEMA_DIR / "vital_signs.schema.json").read_text(encoding="utf-8"))


def vital_sign_keys() -> list[str]:
    """Danh sách khóa chuẩn (phải trùng fn_vital_sign_keys() — có test đối chiếu)."""
    return list(vital_signs_schema()["properties"])


def _fmt(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else str(x)


def _range_checker(spec: dict[str, Any]):
    lo, hi, label, unit = spec["minimum"], spec["maximum"], spec["x-label"], spec["x-unit"]
    decimals = spec.get("x-decimals")
    hint = f" ({spec['x-hint']})" if spec.get("x-hint") else ""

    def check(v):
        if not lo <= v <= hi:
            raise ValueError(f"{label} phải từ {_fmt(lo)} đến {_fmt(hi)} {unit}{hint}")
        return round(v, decimals) if decimals is not None else v

    return check


class _VitalSignsBase(BaseModel):
    # extra="forbid": khóa lạ bị chặn ngay ở API (CSDL cũng chặn bằng chk_visit_vital_signs_keys)
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, strict=False)

    @model_validator(mode="after")
    def _bp_order(self):
        sys_bp = getattr(self, "systolic_bp_mmhg", None)
        dia_bp = getattr(self, "diastolic_bp_mmhg", None)
        if sys_bp is not None and dia_bp is not None and dia_bp >= sys_bp:
            raise ValueError("Huyết áp tâm trương phải nhỏ hơn tâm thu")
        return self

    def to_db(self) -> dict[str, float | int]:
        return self.model_dump(exclude_none=True)


def _build_model() -> type[BaseModel]:
    fields = {}
    for key, spec in vital_signs_schema()["properties"].items():
        py_type = int if spec["type"] == "integer" else float
        annotated = Annotated[py_type, Field(strict=True, description=f"{spec['x-label']} ({spec['x-unit']}), "
                                             f"{_fmt(spec['minimum'])}–{_fmt(spec['maximum'])}"),
                              AfterValidator(_range_checker(spec))]
        fields[key] = (annotated | None, None)
    return create_model("VitalSigns", __base__=_VitalSignsBase, **fields)


VitalSigns = _build_model()


def vital_sign_warnings(vitals: BaseModel | dict | None) -> list[dict[str, Any]]:
    """Cảnh báo mềm: giá trị hợp lệ nhưng hiếm gặp ở mọi lứa tuổi -> client hỏi xác nhận."""
    if vitals is None:
        return []
    data = vitals.to_db() if isinstance(vitals, BaseModel) else vitals
    out = []
    for key, spec in vital_signs_schema()["properties"].items():
        soft, value = spec.get("x-soft"), data.get(key)
        if not soft or value is None:
            continue
        if ("below" in soft and value < soft["below"]) or ("above" in soft and value > soft["above"]):
            out.append({"field": f"vital_signs.{key}", "code": "UNUSUAL_VALUE",
                        "message": f"{spec['x-label']} {_fmt(value)} {spec['x-unit']} hiếm gặp — "
                                   f"vui lòng xác nhận lại"})
    return out
