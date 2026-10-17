"""Typed failures for the worker's Rule-only fallback; messages contain no PHI."""


class LLMError(Exception):
    """Base class for expected local LLM failures."""


class LLMConfigurationError(LLMError, ValueError):
    """The local model, endpoint or request configuration is invalid."""


class LLMTimeoutError(LLMError, TimeoutError):
    """The remaining time budget was exhausted."""


class LLMConnectionError(LLMError):
    """The local Ollama transport failed."""


class LLMHTTPError(LLMError):
    """Ollama returned an unsuccessful HTTP status, without exposing its body."""

    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
        super().__init__(f"Local LLM returned HTTP {status_code}.")


class LLMResponseError(LLMError):
    """The local server returned an incomplete or unexpected response."""


class LLMInvalidJSONError(LLMResponseError):
    """The envelope or generated content is not a strict JSON object."""
