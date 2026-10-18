"""Hợp đồng sinh dữ liệu phiên bản 1, dùng chung cho kiểm tra Node 4/FR12.

Các model này chỉ mô tả hình dạng. Không dùng chúng thay cho
validation.knowledge_validators hoặc kiểm tra ứng viên/bằng chứng/an toàn của Node
4. Không chấp nhận bằng chứng, mã ICD hoặc mức ưu tiên do LLM tự sinh.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

OUTPUT_SCHEMA_VERSION = "1"


class _StrictOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class RankedCondition(_StrictOutput):
    condition_code: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=1, max_length=500)


class ReasoningOutput(_StrictOutput):
    # Node 2 cung cấp tối đa bốn ứng viên nội bộ; Node 4/service giới hạn danh sách
    # hiển thị còn ba và thêm nhãn Reference Suggestion.
    ranking: list[RankedCondition] = Field(max_length=4)
    raise_priority: bool = Field(
        description="Chỉ đề nghị nâng Routine lên HighPriority, không bao giờ hạ mức."
    )


class ExtractedSymptom(_StrictOutput):
    symptom_code: str = Field(min_length=1, max_length=128)
    status: Literal["PRESENT", "ABSENT", "UNKNOWN"]


class ExtractionOutput(_StrictOutput):
    # Kết quả trích xuất chỉ là tạm thời; AI-10 phải kiểm tra catalog Active và điều
    # dưỡng phải xác nhận trước khi đặc trưng trích xuất đi vào đánh giá.
    symptoms: list[ExtractedSymptom]


def reasoning_json_schema() -> dict[str, Any]:
    """Trả schema mới phù hợp tham số format của Ollama."""
    return ReasoningOutput.model_json_schema()


def extraction_json_schema() -> dict[str, Any]:
    return ExtractionOutput.model_json_schema()
