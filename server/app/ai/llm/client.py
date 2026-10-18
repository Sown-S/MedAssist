"""Ranh giới LLM cục bộ công khai, chỉ dùng cho reasoning và extraction ở worker.

Bên gọi cung cấp prompt đã che định danh và ngân sách thời gian *còn lại* (đánh giá:
90 giây; trích xuất: 30 giây, do worker tính từ lúc xếp hàng). Không lưu prompt hay
văn bản sinh ra tại đây; chỉ được log phiên bản prompt. Object sinh ra chưa đáng
tin: Node 4 vẫn phải kiểm tra schema, mã Active, ứng viên, bằng chứng và mức sàn an
toàn Node 1 trước khi sử dụng/hiển thị.
"""

import asyncio
from collections.abc import Mapping
import json
import math
from typing import Any

import httpx

from app.ai.llm.errors import (
    LLMConfigurationError,
    LLMConnectionError,
    LLMError,
    LLMHTTPError,
    LLMInvalidJSONError,
    LLMResponseError,
    LLMTimeoutError,
)
from app.ai.llm.ollama_client import OllamaClient

__all__ = [
    "LLMClient", "LLMError", "LLMConfigurationError", "LLMTimeoutError",
    "LLMConnectionError", "LLMHTTPError", "LLMResponseError", "LLMInvalidJSONError",
]


def _reject_constant(value: str) -> None:
    raise ValueError("Non-JSON numeric constant")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def _json_object(raw: str | bytes) -> dict[str, Any]:
    try:
        value = json.loads(raw, parse_constant=_reject_constant, object_pairs_hook=_unique_object)
    except (ValueError, UnicodeError, RecursionError):
        # Ẩn ngữ cảnh parser vì đầu vào có thể chứa thông tin bệnh nhân.
        raise LLMInvalidJSONError("Local LLM returned invalid JSON.") from None
    if not isinstance(value, dict):
        raise LLMInvalidJSONError("Local LLM output must be a JSON object.")
    return value


class LLMClient:
    """Triển khai app.ai.interfaces.LLMClient mà không chạy tác vụ khi import.

    Tên model truyền rõ ràng là tag model cục bộ đã cài. Không có tag mặc định cho
    đến khi nhóm chốt model. Khởi tạo client không gửi request.
    """

    def __init__(
        self,
        *,
        model: str,
        base_url: str = "http://127.0.0.1:11434",
        keep_alive: str | int = "5m",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._ollama = OllamaClient(
            model=model, base_url=base_url, keep_alive=keep_alive, transport=transport
        )

    @property
    def model(self) -> str:
        return self._ollama.model

    async def generate_json(
        self,
        *,
        prompt: str,
        schema: Mapping[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        """Yêu cầu JSON theo schema; trả object đang chờ Node 4 kiểm tra.

        Timeout HTTPX áp dụng cho từng thao tác I/O. asyncio.timeout đồng thời giới
        hạn toàn bộ request, kể cả response chậm nhưng vẫn tiếp tục gửi dữ liệu.
        Chủ động để cancellation từ worker truyền lên.
        """
        if (
            isinstance(timeout_seconds, bool)
            or not isinstance(timeout_seconds, (int, float))
            or not math.isfinite(timeout_seconds)
        ):
            raise LLMConfigurationError("LLM timeout must be finite seconds.")
        if timeout_seconds <= 0:
            raise LLMTimeoutError("Local LLM time budget is exhausted.")
        if not isinstance(prompt, str) or not prompt.strip() or not isinstance(schema, Mapping):
            raise LLMConfigurationError("A prompt and JSON object schema are required.")
        try:
            # Kiểm tra khả năng tuần tự hóa trước khi HTTPX tạo request. Không đưa
            # giá trị schema hoặc lỗi tuần tự hóa vào log ứng dụng.
            request_schema = json.loads(json.dumps(dict(schema), allow_nan=False))
        except (TypeError, ValueError, RecursionError):
            raise LLMConfigurationError("Invalid LLM JSON schema.") from None
        if request_schema.get("type") != "object":
            raise LLMConfigurationError("LLM schema must describe a JSON object.")
        try:
            async with asyncio.timeout(timeout_seconds):
                raw = await self._ollama.generate(
                    prompt=prompt, schema=request_schema, timeout_seconds=timeout_seconds
                )
        except TimeoutError:
            raise LLMTimeoutError("Local LLM request timed out.") from None
        envelope = _json_object(raw)
        if (
            "error" in envelope
            or envelope.get("done") is not True
            or envelope.get("done_reason", "stop") != "stop"
            or not isinstance(envelope.get("response"), str)
        ):
            raise LLMResponseError("Local LLM returned an invalid or incomplete response.")
        return _json_object(envelope["response"])
