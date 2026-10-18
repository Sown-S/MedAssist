"""Lỗi có kiểu để worker fallback Rule-only; thông báo không chứa dữ liệu y tế cá nhân."""


class LLMError(Exception):
    """Lớp cơ sở cho các lỗi LLM cục bộ dự kiến có thể xảy ra."""


class LLMConfigurationError(LLMError, ValueError):
    """Cấu hình model, endpoint hoặc request cục bộ không hợp lệ."""


class LLMTimeoutError(LLMError, TimeoutError):
    """Ngân sách thời gian còn lại đã hết."""


class LLMConnectionError(LLMError):
    """Lớp truyền tải Ollama cục bộ gặp lỗi."""


class LLMHTTPError(LLMError):
    """Ollama trả HTTP status lỗi; không để lộ nội dung body."""

    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
        super().__init__(f"Local LLM returned HTTP {status_code}.")


class LLMResponseError(LLMError):
    """Máy chủ cục bộ trả response thiếu hoặc không đúng dự kiến."""


class LLMInvalidJSONError(LLMResponseError):
    """Envelope hoặc nội dung sinh ra không phải JSON object nghiêm ngặt."""
