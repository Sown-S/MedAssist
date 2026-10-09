"""Middleware ASGI: gắn X-Request-ID cho mỗi request và ghi một dòng log truy cập."""
import re
import time
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import get_logger, request_id_var

_logger = get_logger("access")
_VALID_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")   # nhận id từ client nếu hợp lệ, không thì tự sinh


class RequestContextMiddleware:
    """Viết dạng ASGI thuần (không dùng BaseHTTPMiddleware) để contextvar request_id
    đi theo cả dependency, handler và exception handler của cùng request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = dict(scope["headers"]).get(b"x-request-id", b"").decode("latin-1")
        request_id = incoming if _VALID_ID.match(incoming) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        scope.setdefault("state", {})["request_id"] = request_id

        status_code = 500
        started = time.perf_counter()

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                message.setdefault("headers", []).append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            # Đường dẫn mẫu: thay ID bằng tên tham số -> không ghi ID bệnh nhân vào log
            path = scope["path"]
            for name, value in (scope.get("path_params") or {}).items():
                path = path.replace(f"/{value}", f"/{{{name}}}", 1)
            _logger.info("%s %s -> %s (%.0f ms)", scope["method"], path, status_code, elapsed_ms)
            request_id_var.reset(token)
