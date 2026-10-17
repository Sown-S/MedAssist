"""Versioned static instructions. Dynamic, de-identified data is added by callers."""

from importlib.resources import files

from app.ai.llm.errors import LLMConfigurationError

REASONING_PROMPT_VERSION = "reasoning-v1"
EXTRACTION_PROMPT_VERSION = "extraction-v1"
_FILES = {
    REASONING_PROMPT_VERSION: "reasoning_v1.txt",
    EXTRACTION_PROMPT_VERSION: "extraction_v1.txt",
}


def load_prompt(version: str) -> str:
    """Load only a known, immutable version; never read an arbitrary path."""
    if version not in _FILES:
        raise LLMConfigurationError("Unknown LLM prompt version.")
    return files(__package__).joinpath(_FILES[version]).read_text(encoding="utf-8")
