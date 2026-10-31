"""Trích xuất triệu chứng tạm thời từ văn bản tiếng Việt đã che định danh (FR12).

Chỉ chạy trong worker sau cổng Node 1; không ghi dữ liệu hay tự xác nhận triệu chứng.
"""

import asyncio
from collections.abc import Sequence
import json
import math
import re
from time import monotonic
from typing import Literal, TypedDict
import unicodedata

from pydantic import TypeAdapter, ValidationError
from sqlalchemy.orm import Session

from app.ai.interfaces import KnowledgeReader, LLMClient
from app.ai.llm.client import LLMError
from app.ai.llm.output_schemas import ExtractionOutput, extraction_json_schema
from app.ai.llm.prompts import EXTRACTION_PROMPT_VERSION, load_prompt
from app.ai.pipeline.state import PipelineState
from app.exceptions import AppError
from app.validation import knowledge_validators

EXTRACTION_TIMEOUT_SECONDS = 30
_CODES = TypeAdapter(list[knowledge_validators.SymptomCode])
_MASK = "[REDACTED]"

# Các nhãn mơ hồ (bệnh nhân, BN, patient) bắt buộc có dấu ':' hoặc '=' để không xóa nhầm
# câu lâm sàng như "Bệnh nhân đau đầu 2 ngày".
_IDENTITY_FIELDS = re.compile(
    r"(?i)\b(?:địa\s*chỉ|dia\s*chi|address|nơi\s*ở|noi\s*o)"
    r"\s*[:=]?\s*[^\r\n;!?]+"
    r"|\b(?:họ(?:\s+và)?\s*tên|ho(?:\s+va)?\s*ten|tên\s+bệnh\s+nhân|"
    r"full_name|patient\s+name|"
    r"ngày\s*sinh|ngay\s*sinh|sinh\s+ngày|dob|date_of_birth|"
    r"cccd|cmnd|bhyt|số\s*điện\s*thoại|sdt|sđt|phone|"
    r"mã\s*bệnh\s*nhân|patient_id|visit_id)\s*[:=]?\s*[^\r\n,;!?]+"
    r"|\b(?:bệnh\s+nhân|benh\s+nhan|bn|patient)\s*[:=]\s*[^\r\n,;!?]+"
    r"|\b(?:tên|ten|name|email)\s*[:=]\s*[^\r\n,;!?]+"
)
_CONTACT_PATTERNS = (
    re.compile(r"[\w.+-]+@[\w.-]+\.[^\W\d_]{2,}", re.UNICODE),
    re.compile(r"\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b", re.I),
    re.compile(r"\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d\d?[/.-]\d\d?[/.-]\d{2,4}\b"),
    re.compile(r"(?<!\w)\+?\d(?:[\s().-]*\d){8,14}(?!\w)"),
)


class SymptomSuggestion(TypedDict):
    symptom_code: str
    status: Literal["PRESENT", "ABSENT", "UNKNOWN"]
    label: Literal["Reference Suggestion"]
    requires_confirmation: Literal[True]


async def extract_symptoms(
    text: str,
    knowledge_reader: KnowledgeReader,
    llm_client: LLMClient,
    db: Session,
    *,
    gate_state: PipelineState,
    identifiers: Sequence[str],
    timeout_seconds: float,
) -> list[SymptomSuggestion]:
    """Trả đề xuất thuộc catalog Active từ văn bản đã che định danh (tối đa 30 giây).
    Bỏ qua nếu Node 1 báo cờ đỏ; trả ``[]`` khi quá hạn, lỗi LLM hoặc đầu ra không hợp lệ."""
    started = monotonic()
    if (
        gate_state.get("is_red_flag") is True
        or gate_state.get("ai_status") == "Skipped"
        or gate_state.get("priority_rule") == "Emergency"
        or gate_state.get("priority_final") == "Emergency"
    ):
        return []
    if (
        gate_state.get("is_red_flag") is not False
        or gate_state.get("priority_rule") not in ("Routine", "HighPriority")
        or gate_state.get("priority_final") not in ("Routine", "HighPriority")
    ):
        raise ValueError("Phải chạy Node 1 trước khi trích xuất triệu chứng")
    if (
        isinstance(timeout_seconds, bool)
        or not isinstance(timeout_seconds, (int, float))
        or not math.isfinite(timeout_seconds)
    ):
        raise ValueError("Extraction timeout must be finite seconds.")
    deadline = started + min(timeout_seconds, EXTRACTION_TIMEOUT_SECONDS)
    if deadline <= monotonic():
        return []

    masked = _redact_identifiers(text, identifiers)
    if not masked.strip() or not masked.replace(_MASK, "").strip(" \t\r\n,;:.!?"):
        return []
    catalogue = _catalogue(knowledge_reader)
    if not catalogue:
        return []
    prompt_catalogue = _select_prompt_catalogue(catalogue, masked)
    prompt = load_prompt(EXTRACTION_PROMPT_VERSION) + "\n" + json.dumps(
        {"catalogue": prompt_catalogue, "text": masked}, ensure_ascii=False, allow_nan=False,
    )
    remaining = deadline - monotonic()
    if remaining <= 0:
        return []
    try:
        async with asyncio.timeout(remaining):
            output = await llm_client.generate_json(
                prompt=prompt, schema=extraction_json_schema(), timeout_seconds=remaining,
            )
    except (LLMError, TimeoutError):
        return []
    if monotonic() >= deadline:
        return []
    suggestions = _validated_suggestions(output, {row["symptom_code"] for row in prompt_catalogue})
    if not suggestions:
        return []
    try:
        # Kiểm tra lại sau suy luận vì mã có thể đã bị ngừng trong lúc chờ.
        knowledge_validators.active_symptoms(db, [row["symptom_code"] for row in suggestions])
    except AppError as exc:
        if exc.code != "UNKNOWN_SYMPTOM":
            raise
        return []
    return suggestions if monotonic() < deadline else []


def _normalise(value: str) -> str:
    # Chuẩn hóa tiếng Việt dạng tách dấu và ký tự full-width; bỏ ký tự định dạng vô
    # hình để chúng không thể làm sai phép khớp chính xác giá trị định danh.
    return "".join(
        char for char in unicodedata.normalize("NFKC", value)
        if unicodedata.category(char) != "Cf"
    )


def _redact_identifiers(text: str, identifiers: Sequence[str]) -> str:
    if (
        not isinstance(text, str)
        or not isinstance(identifiers, Sequence)
        or isinstance(identifiers, (str, bytes))
        or any(not isinstance(value, str) or not value.strip() for value in identifiers)
    ):
        raise ValueError("Invalid extraction text or identifying values.")
    masked = _normalise(text)
    values = sorted({_normalise(value).strip() for value in identifiers}, key=len, reverse=True)
    if any(not value for value in values):
        raise ValueError("Invalid extraction identifying values.")
    if values:
        # Escape định danh dạng literal, cho phép khoảng trắng/hoa thường linh hoạt
        # và che phần chồng lấn trong một lượt. Không coi định danh là regex hay log.
        pattern = "|".join(r"\s+".join(re.escape(part) for part in value.split()) for value in values)
        masked = re.sub(pattern, _MASK, masked, flags=re.IGNORECASE)
    masked = _IDENTITY_FIELDS.sub(_MASK, masked)
    for pattern in _CONTACT_PATTERNS:
        masked = pattern.sub(_MASK, masked)
    return masked


def _catalogue(reader: KnowledgeReader) -> list[dict[str, str]]:
    rows = reader.active_symptoms()
    try:
        codes = _CODES.validate_python([row["symptom_code"] for row in rows], strict=True)
        names = [row.get("symptom_name", code) for row, code in zip(rows, codes, strict=True)]
        if len(set(codes)) != len(codes) or any(
            not isinstance(name, str) or not name.strip() for name in names
        ):
            raise ValueError
    except (KeyError, TypeError, ValueError):
        # Validator mã dùng chung quản lý quy tắc slug/độ dài; ẩn chi tiết Pydantic
        # có chứa đầu vào. Các lỗi reader/hạ tầng khác vẫn được truyền lên.
        raise ValueError("Invalid Active symptom catalogue.") from None
    # Model Symptom hiện dùng symptom_name. Nếu thiếu tên thì tạm dùng mã cho đến
    # khi tích hợp mapping reader thật; không chép metadata khác (ID, trường audit,
    # ghi chú...) vào prompt.
    return [
        {"symptom_code": code, "symptom_name": name}
        for code, name in sorted(zip(codes, names, strict=True))
    ]


def _validated_suggestions(output: object, allowed: set[str]) -> list[SymptomSuggestion]:
    if not isinstance(output, dict):
        return []
    try:
        proposal = ExtractionOutput.model_validate(output, strict=True)
        _CODES.validate_python([row.symptom_code for row in proposal.symptoms], strict=True)
    except ValidationError:
        return []
    statuses: dict[str, Literal["PRESENT", "ABSENT", "UNKNOWN"]] = {}
    for row in proposal.symptoms:
        if row.symptom_code not in allowed:
            continue
        if row.symptom_code in statuses and statuses[row.symptom_code] != row.status:
            # Không được âm thầm chọn một trạng thái khi LLM sinh trạng thái mâu thuẫn.
            return []
        statuses[row.symptom_code] = row.status
    return [
        {"symptom_code": code, "status": status,
         "label": "Reference Suggestion", "requires_confirmation": True}
        for code, status in sorted(statuses.items())
    ]


_MAX_PROMPT_CATALOGUE = 20
_STOP_WORDS = frozenset({
    "va", "hoac", "co", "khong", "bi", "la", "o", "tai", "cac", "vung",
    "benh", "nhan", "ngay", "nay", "khi", "do", "kem", "theo", "tren",
    "duoi", "trong", "ngoai", "mot", "hai", "ba", "bon", "nam", "sau",
    "bay", "tam", "chin", "muoi", "nhieu", "it", "ro", "hon", "gay",
    "lam", "thay", "kham", "redacted",
})

# Bảng mở rộng từ đồng nghĩa/khẩu ngữ lâm sàng tiếng Việt sang thuật ngữ y khoa chuẩn
# giúp tầng lọc ứng viên (Stage 1) giữ độ phủ cao mà vẫn cố định O(1) lần gọi LLM.
_CLINICAL_SYNONYMS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("nóng người", "nong nguoi", "nóng sốt", "hầm hập", "sốt nóng"), "sốt cao sốt nhẹ fever"),
    (("gai người", "gai nguoi", "lạnh run", "sợ lạnh", "ớn lạnh"), "ớn lạnh gai rét rét run chills"),
    (("nhức đầu", "nhuc dau", "nặng đầu", "váng đầu"), "đau nhức đầu headache"),
    (("xây xẩm", "xay xam", "choáng váng", "quay cuồng"), "chóng mặt hoa mắt mất thăng bằng vertigo"),
    (("ói", "mửa", "nôn mửa", "buồn ói", "non mua", "buon oi"), "buồn nôn nôn ói nôn vọt nausea vomiting"),
    (("đi ngoài", "di ngoai", "đi cầu", "ỉa chảy", "ia chay", "tiêu lỏng"), "tiêu chảy phân lỏng đi ngoài phân nhầy máu diarrhea"),
    (("đau bao tử", "dau bao tu", "đau dạ dày", "đau thượng vị"), "đau bụng buồn nôn"),
    (("hụt hơi", "hut hoi", "ngộp thở", "thở dốc", "khó thở", "kho tho"), "khó thở gắng sức suy hô hấp dyspnea"),
    (("khò khè", "kho khe", "cò cử", "thở rít"), "thở khò khè cò cử thở rít wheezing stridor"),
    (("sổ mũi", "so mui", "chảy mũi"), "sổ mũi chảy nước mũi rhinorrhea"),
    (("nghẹt mũi", "nghet mui", "tắc mũi", "ngạt mũi"), "ngạt tắc mũi nasal obstruction"),
    (("chảy máu cam", "chay mau cam"), "chảy máu mũi epistaxis"),
    (("đau họng", "dau hong", "rát cổ", "đau cổ họng", "nuốt vướng"), "đau rát họng nuốt đau amidan sore throat"),
    (("khàn giọng", "khan giong", "mất giọng", "tắt tiếng"), "khàn tiếng mất tiếng hoarseness"),
    (("mề đay", "me day", "nổi mẩn", "nổi cục", "dị ứng da"), "mày đay ngứa da phát ban hồng ban rash pruritus"),
    (("mờ mắt", "mo mat", "nhìn không rõ"), "nhìn mờ giảm thị lực visual"),
    (("nhức mỏi", "nhuc moi", "đau mình mẩy", "ê ẩm người"), "đau mỏi cơ đau nhức khớp mệt mỏi myalgia fatigue"),
    (("tức ngực", "tuc nguc", "nặng ngực", "đè ngực"), "đau thắt ngực đè ép ngực nặng ngực chest pain"),
    (("nổi hạch", "noi hach", "sưng hạch"), "hạch ngoại vi sưng to lymphadenopathy"),
    (("đái buốt", "dai buot", "tiểu gắt", "tiểu rắt"), "tiểu buốt bí tiểu"),
    (("ngất xỉu", "ngat xiu", "bất tỉnh", "mê man"), "lơ mơ li bì lú lẫn hôn mê consciousness"),
)


def _strip_accents(value: str) -> str:
    value = value.replace("đ", "d").replace("Đ", "D")
    return "".join(
        char for char in unicodedata.normalize("NFD", value)
        if unicodedata.category(char) != "Mn"
    )


def _trigger_matches(trigger: str, lowered: str, unaccented: str) -> bool:
    # Từ khóa có dấu chỉ khớp văn bản có dấu; không tự bỏ dấu từ khóa vì "ói" -> "oi"
    # sẽ khớp nhầm "ơi", "mửa" -> "mua" khớp nhầm "mùa". Biến thể không dấu được liệt
    # kê riêng trong bảng và chỉ so với văn bản đã bỏ dấu.
    if _strip_accents(trigger) == trigger:
        return re.search(rf"\b{re.escape(trigger)}\b", unaccented) is not None
    return re.search(rf"\b{re.escape(trigger)}\b", lowered) is not None


def _expand_colloquial_text(value: str) -> str:
    lowered = value.lower()
    unaccented = _strip_accents(lowered)
    additions = [
        canonical for triggers, canonical in _CLINICAL_SYNONYMS
        if any(_trigger_matches(trigger, lowered, unaccented) for trigger in triggers)
    ]
    return f"{lowered} {' '.join(additions)}" if additions else lowered


def _lexical_features(value: str, *, expand_synonyms: bool = False) -> tuple[set[str], set[str], set[str], set[str]]:
    lowered = _expand_colloquial_text(value) if expand_synonyms else value.lower()
    words = re.findall(r"\w+", lowered)
    unaccented = [_strip_accents(w) for w in words]
    word_set = {w for w, uw in zip(words, unaccented) if len(uw) >= 2 and uw not in _STOP_WORDS}
    unacc_set = {uw for uw in unaccented if len(uw) >= 2 and uw not in _STOP_WORDS}
    bigrams = {f"{words[i]} {words[i + 1]}" for i in range(len(words) - 1)}
    unacc_bigrams = {f"{unaccented[i]} {unaccented[i + 1]}" for i in range(len(unaccented) - 1)}
    return word_set, unacc_set, bigrams, unacc_bigrams


def _select_prompt_catalogue(
    catalogue: list[dict[str, str]],
    text: str,
) -> list[dict[str, str]]:
    """Lọc Top-K ứng viên sát nhất có mở rộng từ đồng nghĩa/khẩu ngữ để giữ cố định 1 lần gọi LLM."""
    if len(catalogue) <= _MAX_PROMPT_CATALOGUE:
        return catalogue
    tw, tuw, tbi, tubi = _lexical_features(text, expand_synonyms=True)
    scored: list[tuple[float, str, dict[str, str]]] = []
    for row in catalogue:
        code = row["symptom_code"]
        name = row["symptom_name"]
        sw, suw, sbi, subi = _lexical_features(name)
        code_tokens = {tok for tok in code.split("_") if len(tok) >= 3}
        score = (
            3.0 * len(tbi & sbi)
            + 2.0 * len(tubi & subi)
            + 1.5 * len(tw & sw)
            + 1.0 * len(tuw & suw)
            + 1.5 * len(tuw & code_tokens)
        )
        scored.append((score, code, row))
    scored.sort(key=lambda item: (-item[0], item[1]))
    selected = [item[2] for item in scored[:_MAX_PROMPT_CATALOGUE]]
    selected.sort(key=lambda item: item["symptom_code"])
    return selected
