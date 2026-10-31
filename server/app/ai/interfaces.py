"""Hợp đồng phụ thuộc của pipeline AI.

Chỉ nhận mapping thuần để tách biệt với model SQLAlchemy và tầng lưu trữ.
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
        """Trả các bệnh Active kèm ``symptoms`` và ``guidelines`` Active.
        Mỗi guideline gồm ``excerpt_key``, ``title``, ``content``, ``source_title`` và ``source_locator``."""
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
        """Yêu cầu JSON theo schema; kết quả chưa đáng tin cho đến khi qua Node 4 hoặc HITL."""
        ...
