"""Đề xuất số đo có ngữ cảnh rõ ràng; không xác nhận hay lưu sinh hiệu."""

import re
import unicodedata

from pydantic import ValidationError

from app.validation.schema_validators import VitalSigns, vital_sign_keys

_NUM = r"\d+(?:[.,]\d+)?"
_END = r"(?!\w|[.,]\d|\s*(?:kg|cm|mmhg|%|°f)\b)"
_PATTERNS = (
    ("bp", rf"\b(?:ha|huyet\s+ap)\s*[:=]?\s*(?P<a>{_NUM})\s*(?:/|tren)\s*(?P<b>{_NUM})(?!\w|[.,]\d)"),
    ("height_m", r"\b(?:cao|chieu\s+cao)\s*[:=]?\s*(?P<a>\d+)\s*m\s*(?P<b>\d{2})(?!\w|[.,]\d)"),
    ("height_m_decimal", rf"\b(?:cao|chieu\s+cao)\s*[:=]?\s*(?P<a>{_NUM})\s*m\b"),
    ("height_cm", rf"\b(?:cao|chieu\s+cao)\s*[:=]?\s*(?P<a>{_NUM})\s*cm\b"),
    ("weight_kg", rf"\b(?:nang|can\s+nang)\s*[:=]?\s*(?P<a>{_NUM})\s*kg\b"),
    ("heart_rate_bpm", rf"\b(?:mach|nhip\s+tim)\s*[:=]?\s*(?P<a>{_NUM}){_END}"),
    ("respiratory_rate_bpm", rf"\b(?:nhip\s+tho)\s*[:=]?\s*(?P<a>{_NUM}){_END}"),
    ("spo2_pct", rf"\bspo2\s*[:=]?\s*(?P<a>{_NUM})(?:\s*%)?(?!\w|[.,]\d)"),
    ("temperature_c", rf"\b(?:sot|nhiet\s+do)\s*[:=]?\s*(?P<a>{_NUM})(?:\s*(?:°\s*c|do(?:\s*c)?))?{_END}"),
    ("temperature_c", rf"(?<![\w.,])(?P<a>{_NUM})\s*(?:°\s*c|do(?:\s*c)?){_END}"),
)
_COMPILED = [(key, re.compile(pattern)) for key, pattern in _PATTERNS]
_CLAUSE = re.compile(r"[;.!?\n]|(?<!\d),|,(?!\d)|\b(?:nhung|tuy\s+nhien)\b")
_NEGATIVE = re.compile(r"\b(?:khong|chua|phu\s+nhan|khong\s+ro)\b")


def _plain(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value.lower().replace("đ", "d"))
                   if unicodedata.category(c) != "Mn")


def extract_vitals(text: str) -> list[dict]:
    """Chỉ nhận chữ số. Mâu thuẫn cùng khóa thì bỏ, huyết áp xử lý theo cặp.

    Evidence chỉ là đoạn khớp số đo, không lấy cả câu có thể chứa định danh.
    Khoảng hợp lệ và kiểu số do VitalSigns dùng chung quyết định.
    """
    if not text:
        return []
    original = unicodedata.normalize("NFC", text)
    plain = _plain(original)
    # Văn bản tiếng Việt NFC giữ cùng vị trí sau bỏ dấu; ký tự đặc biệt có thể
    # đổi độ dài thì bỏ thay vì trích nhầm evidence.
    if len(plain) != len(original):
        return []
    found: dict[str, list[dict]] = {}
    consumed = []
    for kind, pattern in _COMPILED:
        for match in pattern.finditer(plain):
            if any(a <= match.start() < b for a, b in consumed):
                continue
            prefix = plain[:match.start()]
            boundaries = list(_CLAUSE.finditer(prefix))
            prefix = prefix[boundaries[-1].end():] if boundaries else prefix
            if _NEGATIVE.search(prefix):
                continue
            a = float(match["a"].replace(",", "."))
            if kind == "bp":
                values = {"systolic_bp_mmhg": a, "diastolic_bp_mmhg": float(match["b"].replace(",", "."))}
            elif kind == "height_m":
                values = {"height_cm": a * 100 + int(match["b"])}
            elif kind == "height_m_decimal":
                values = {"height_cm": round(a * 100, 6)}
            else:
                values = {kind: a}
            # Validator strict yêu cầu int cho mạch, nhịp thở, HA, SpO2.
            values = {k: int(v) if v.is_integer() else v for k, v in values.items()}
            try:
                valid = VitalSigns.model_validate(values).to_db()
            except ValidationError:
                continue
            consumed.append(match.span())
            if match.end() - match.start() > 160:
                continue
            for key, value in valid.items():
                found.setdefault(key, []).append({
                    "key": key, "value": value, "evidence": original[match.start():match.end()].strip(),
                    "group": "blood_pressure" if key in {"systolic_bp_mmhg", "diastolic_bp_mmhg"} else None,
                })
    conflict = {k for k, proposals in found.items() if len({p["value"] for p in proposals}) > 1}
    bp = {"systolic_bp_mmhg", "diastolic_bp_mmhg"}
    if conflict & bp:
        conflict |= bp
    return [found[k][0] for k in vital_sign_keys() if k in found and k not in conflict]
