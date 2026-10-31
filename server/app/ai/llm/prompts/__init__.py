"""Chỉ dẫn tĩnh có phiên bản; bên gọi bổ sung dữ liệu động đã che định danh."""

from importlib.resources import files

from app.ai.llm.errors import LLMConfigurationError

REASONING_PROMPT_VERSION = "reasoning-v3"
EXTRACTION_PROMPT_VERSION = "extraction-v1"
_FILES = {
    "reasoning-v1": "reasoning_v1.txt",
    "reasoning-v2": "reasoning_v2.txt",
    REASONING_PROMPT_VERSION: "reasoning_v3.txt",
    EXTRACTION_PROMPT_VERSION: "extraction_v1.txt",
}


def load_prompt(version: str) -> str:
    """Chỉ nạp phiên bản bất biến đã biết, không đọc đường dẫn tùy ý."""
    if version not in _FILES:
        raise LLMConfigurationError("Unknown LLM prompt version.")
    return files(__package__).joinpath(_FILES[version]).read_text(encoding="utf-8")
