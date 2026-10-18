"""Các ranh giới phụ thuộc ổn định mà pipeline AI sử dụng.

Pipeline chỉ nhận các mapping thuần để không phụ thuộc model SQLAlchemy hoặc cách
triển khai Knowledge Reader cụ thể thuộc module khác.
"""

from collections.abc import Mapping, Sequence
from typing import Any, Protocol, runtime_checkable

JsonObject = Mapping[str, Any]


@runtime_checkable
class KnowledgeReader(Protocol):
    """Đọc bản phát hành tri thức Active dùng cho một lượt đánh giá."""

    def active_release(self) -> JsonObject:
        """Trả metadata của bản phát hành tri thức đang Active."""
        ...

    def active_triage_rules(self) -> Sequence[JsonObject]:
        """Trả các luật cờ đỏ và mức sàn ưu tiên đang Active."""
        ...

    def active_conditions(self) -> Sequence[JsonObject]:
        """Trả các bệnh Active cùng ``symptoms``/``guidelines`` Active lồng bên trong.

        Mapping tạm của Node 2: condition_code, name_vi, icd10_code; symptoms chứa
        symptom_code, polarity, weight, is_key; guidelines chứa excerpt_key cùng
        các trường excerpt/source. Phải đối chiếu với OKF và reader thật trước khi
        tích hợp production.
        """
        ...

    def active_symptoms(self) -> Sequence[JsonObject]:
        """Trả danh mục triệu chứng đang Active."""
        ...


@runtime_checkable
class LLMClient(Protocol):
    """Ranh giới LLM cục bộ có đầu ra cấu trúc, chỉ dùng trong worker."""

    async def generate_json(
        self,
        *,
        prompt: str,
        schema: Mapping[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        """Yêu cầu JSON bị ràng buộc bởi schema hoặc phát sinh lỗi client có kiểu.

        Object trả về vẫn chưa đáng tin cho đến khi Node 4 kiểm tra, hoặc với trích
        xuất là sau khi kiểm tra catalog Active và điều dưỡng xác nhận, rồi mới dùng.
        """
        ...
