"""FR12: trích xuất tạm từ văn bản tiếng Việt đã che định danh, chỉ chạy ở worker.

Bên gọi phải chạy Node 1 trước, truyền thời gian hàng đợi còn lại và mọi giá trị
định danh đã biết (tên, địa chỉ, ngày sinh, điện thoại, giấy tờ và bí danh có trong
ghi chú). Che bằng mẫu chỉ bổ sung cho các giá trị đó, không phải bộ nhận diện thực
thể có tên dùng chung. Module này không ghi log, lưu dữ liệu hoặc đổi trạng thái
lâm sàng. Chỉ sau khi điều dưỡng xác nhận mới được chép đề xuất vào input_features.
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

# Tên/địa chỉ/giấy tờ có nhãn có thể chứa khoảng trắng, dấu câu và chữ số. Che thận
# trọng toàn bộ trường, kể cả dấu phẩy trong địa chỉ. Các từ mơ hồ thường xuất hiện
# tự nhiên trong câu lâm sàng (``bệnh nhân``, ``BN``, ``patient``) phải có dấu
# ``:``/``=`` rõ ràng; nếu không, câu như "Bệnh nhân đau đầu 2 ngày" sẽ bị mất nội
# dung triệu chứng. Danh sách giá trị định danh đã biết bên dưới xử lý tên không có
# dấu phân cách rõ ràng.
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
    re.compile(r"\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b"),
    # Số điện thoại/giấy tờ, kể cả +84, khoảng trắng, dấu chấm, gạch nối hoặc ngoặc.
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
    """Trả đề xuất thuộc catalog Active, không bao giờ là đặc trưng đã xác nhận.

    Chỉ gọi từ worker qua assessment_service, bên ngoài graph đánh giá.
    ``gate_state`` phải là kết quả Node 1 trên dữ liệu đã xác nhận; có cờ đỏ thì bỏ
    qua trích xuất. ``identifiers`` luôn bắt buộc, kể cả danh sách rỗng, để worker
    chủ động cung cấp mọi giá trị định danh đã biết trước khi suy luận. Không đưa
    object/metadata bệnh nhân thô vào prompt.

    ``timeout_seconds`` là thời gian còn lại tính từ lúc xếp hàng, tối đa 30 giây.
    Chuẩn bị và kiểm tra cùng tiêu thụ ngân sách này. Hết giờ, lỗi LLM có kiểu hoặc
    đầu ra sai đều trả []; không thử lại. Hủy từ worker và lỗi hạ tầng/lập trình
    được truyền lên. Session chỉ chuyển cho validator Active dùng chung, không được
    dùng để ghi, commit hoặc rollback tại đây.
    """
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
    allowed = {row["symptom_code"] for row in catalogue}
    prompt = load_prompt(EXTRACTION_PROMPT_VERSION) + "\n" + json.dumps(
        {"catalogue": catalogue, "text": masked}, ensure_ascii=False, allow_nan=False,
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

    # Trích xuất là thao tác FR12 riêng nên kiểm tra schema/Active ngay tại đây.
    # Node 4 vẫn kiểm tra đầu ra đánh giá sau khi điều dưỡng xác nhận.
    suggestions = _validated_suggestions(output, allowed)
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
