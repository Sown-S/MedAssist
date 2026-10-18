"""LLM giả lập tất định (LLM_PROVIDER=fake) cho máy không có Ollama: dev, CI, demo dự phòng.

Đọc lại dữ liệu mà Node 3 / trích xuất đã đưa vào prompt nên kết quả luôn nằm trong ứng viên
Node 2 và catalog Active; Node 4 vẫn kiểm tra như với LLM thật. Cấm dùng ở prod (Settings).
"""

import json
import re
import unicodedata
from collections.abc import Mapping
from typing import Any

from app.ai.llm.errors import LLMConfigurationError, LLMResponseError, LLMTimeoutError

FAKE_MODEL_NAME = "fake"


class FakeLLMClient:
    model = FAKE_MODEL_NAME

    async def generate_json(
        self,
        *,
        prompt: str,
        schema: Mapping[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        if timeout_seconds <= 0:
            raise LLMTimeoutError("Local LLM time budget is exhausted.")
        payload = _payload(prompt)
        title = schema.get("title")
        if title == "ReasoningOutput":
            return _reasoning(payload)
        if title == "ExtractionOutput":
            return _extraction(payload)
        raise LLMConfigurationError("Fake LLM does not support this schema.")


def _payload(prompt: str) -> dict[str, Any]:
    # Prompt = chỉ dẫn tĩnh + "\n" + một dòng JSON (node3_reasoning, feature_extractor).
    try:
        value = json.loads(prompt.rsplit("\n", 1)[-1])
    except ValueError:
        raise LLMResponseError("Fake LLM could not read the prompt payload.") from None
    if not isinstance(value, dict):
        raise LLMResponseError("Fake LLM could not read the prompt payload.")
    return value


def _reasoning(payload: dict[str, Any]) -> dict[str, Any]:
    ranking = []
    for candidate in payload.get("candidates", []):
        codes = [row["symptom_code"] for row in candidate["supporting_evidence"]]
        codes += [row["symptom_code"] for row in candidate["contradicting_evidence"]]
        codes += candidate["unknown_key_symptoms"]
        # Node 4 yêu cầu lý do tiếng Việt có dấu và dẫn đúng một mã bằng chứng của ứng viên.
        reason = (f"Gợi ý giả lập: dựa trên triệu chứng {codes[0]}." if codes
                  else "Gợi ý giả lập: chưa có bằng chứng.")
        ranking.append({"condition_code": candidate["condition_code"], "reason": reason})
    return {"ranking": ranking, "raise_priority": False}


_QUALIFIERS = (("chưa rõ", "UNKNOWN"), ("không", "ABSENT"))


def _fold(value: str) -> str:
    return unicodedata.normalize("NFC", value).casefold()


def _status(text: str, name: str) -> str | None:
    match = re.search(rf"(?<!\w){re.escape(name)}(?!\w)", text)
    if match is None:
        return None
    before = text[:match.start()].rstrip()
    for word, status in _QUALIFIERS:
        if before.endswith(word):
            return status
    return "PRESENT"


def _extraction(payload: dict[str, Any]) -> dict[str, Any]:
    text = _fold(payload.get("text", ""))
    symptoms = []
    for row in payload.get("catalogue", []):
        name = _fold(row["symptom_name"]).strip()
        status = _status(text, name) if name else None
        if status is not None:
            symptoms.append({"symptom_code": row["symptom_code"], "status": status})
    return {"symptoms": symptoms}
