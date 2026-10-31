"""Ranh giới LLM cục bộ cho reasoning và extraction trong worker.

Không log/lưu prompt hay văn bản sinh ra; đầu ra phải qua Node 4 hoặc HITL kiểm tra.
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
from app.ai.test_mode import unlimited_assessment

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
    """Client LLM cục bộ; khởi tạo không tạo kết nối mạng."""

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
        """Yêu cầu JSON theo schema với giới hạn tổng thời gian ``asyncio.timeout``."""
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
            request_timeout = None if unlimited_assessment.get() else timeout_seconds
            async with asyncio.timeout(request_timeout):
                raw = await self._ollama.generate(
                    prompt=prompt, schema=request_schema, timeout_seconds=request_timeout
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
