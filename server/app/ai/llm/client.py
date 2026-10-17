"""Public local LLM boundary for worker-side reasoning and extraction only.

Callers supply an already de-identified prompt and the *remaining* time budget
(assessment: 90s; extraction: 30s, measured from queueing by the worker). Never
persist prompts or generated text here. Only prompt versions may be logged.
Generated objects are untrusted: Node 4 must still validate schema, Active codes,
candidate membership, evidence and the Node 1 safety floor before use/display.
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
        # Suppress parser context: its input can contain patient information.
        raise LLMInvalidJSONError("Local LLM returned invalid JSON.") from None
    if not isinstance(value, dict):
        raise LLMInvalidJSONError("Local LLM output must be a JSON object.")
    return value


class LLMClient:
    """Implements app.ai.interfaces.LLMClient without starting work at import.

    The explicit model name is the installed local model tag; there is no
    default tag until the team selects a model. Construction makes no requests.
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
        """Request schema-constrained JSON; return an object pending Node 4.

        HTTPX timeouts apply per I/O operation. asyncio.timeout additionally
        bounds the whole request, including slow responses that keep arriving.
        Cancellation from the worker is deliberately allowed to propagate.
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
            # Check serializability before HTTPX constructs a request. Do not
            # echo schema values or serialization errors to application logs.
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
