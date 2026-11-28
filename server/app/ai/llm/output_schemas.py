"""Schema JSON đầu ra của LLM cho Node 4 và trích xuất triệu chứng (FR12).

Không chấp nhận bằng chứng, mã ICD hoặc mức ưu tiên hạ thấp do LLM tự sinh.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

OUTPUT_SCHEMA_VERSION = "1"
_MAX_DISPLAYED_REASONING = 3


class _StrictOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class RankedCondition(_StrictOutput):
    condition_code: str = Field(min_length=1, max_length=128)
    reason: str = Field(
        min_length=0, max_length=500,
        description="Với 3 vị trí đầu: bắt đầu bằng [symptom_code] nguyên văn từ supporting_evidence "
                    "của đúng condition_code này, sau đó một câu ngắn ≤ 180 ký tự tiếng Việt có dấu. "
                    "Không thay mã bằng tên triệu chứng; không bịa bằng chứng; gọi bệnh là ứng viên này. "
                    "Vị trí thứ 4 (nếu có): để chuỗi rỗng \"\".",
    )


class ReasoningOutput(_StrictOutput):
    # Node 2 cung cấp tối đa bốn ứng viên nội bộ; Node 4/service giới hạn danh sách
    # hiển thị còn ba và thêm nhãn Reference Suggestion.
    ranking: list[RankedCondition] = Field(max_length=4)
    raise_priority: bool = Field(
        description="Chỉ đề nghị nâng Routine lên HighPriority, không bao giờ hạ mức."
    )

    @model_validator(mode="after")
    def _require_reasons_for_top_three(self) -> "ReasoningOutput":
        for row in self.ranking[:_MAX_DISPLAYED_REASONING]:
            if not row.reason:
                raise ValueError("Ba ứng viên đầu phải có giải thích")
        return self


class ExtractedSymptom(_StrictOutput):
    symptom_code: str = Field(min_length=1, max_length=128)
    status: Literal["PRESENT", "ABSENT", "UNKNOWN"]


class ExtractionOutput(_StrictOutput):
    # Kết quả trích xuất chỉ là tạm thời; AI-10 phải kiểm tra catalog Active và điều
    # dưỡng phải xác nhận trước khi đặc trưng trích xuất đi vào đánh giá.
    symptoms: list[ExtractedSymptom]


def reasoning_json_schema(condition_codes: list[str] | None = None) -> dict[str, Any]:
    """Trả schema mới phù hợp tham số format của Ollama."""
    schema = ReasoningOutput.model_json_schema()
    if condition_codes is not None:
        schema["$defs"]["RankedCondition"]["properties"]["condition_code"]["enum"] = list(condition_codes)
        ranking = schema["properties"]["ranking"]
        ranking["minItems"] = ranking["maxItems"] = len(condition_codes)
        ranking["description"] = (
            "Mỗi mã sau xuất hiện đúng một lần, không lặp, không bỏ; chỉ viết reason cho tối đa 3 mã đầu, "
            "mã thứ 4 để reason rỗng \"\": " + ", ".join(condition_codes)
        )
    return schema


def extraction_json_schema(symptom_codes: list[str] | None = None) -> dict[str, Any]:
    """Ràng buộc mã được sinh theo snapshot catalog của từng lần trích xuất."""
    schema = ExtractionOutput.model_json_schema()
    if symptom_codes is not None:
        schema["$defs"]["ExtractedSymptom"]["properties"]["symptom_code"]["enum"] = list(symptom_codes)
    return schema
