"""Adapter HTTP nội bộ cho Ollama. Worker gọi qua llm.client.LLMClient.

Tham khảo API: https://docs.ollama.com/api/generate
Chỉ chấp nhận loopback, địa chỉ LAN RFC1918/ULA và các hostname Docker cục bộ bên
dưới. Alias DNS ngoài danh sách phải cấu hình bằng IP riêng. Khi triển khai cũng
phải tắt tính năng cloud của Ollama; client không dùng thông tin xác thực.
"""

from collections.abc import Mapping
from ipaddress import ip_address, ip_network
from typing import Any

import httpx

from app.ai.llm.errors import (
    LLMConfigurationError,
    LLMConnectionError,
    LLMHTTPError,
    LLMTimeoutError,
)

_LOCAL_HOSTS = frozenset({"localhost", "ollama", "host.docker.internal"})
_LAN_NETWORKS = tuple(
    ip_network(network)
    for network in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7")
)


def _local_url(base_url: str) -> httpx.URL:
    try:
        url = httpx.URL(base_url)
    except (httpx.InvalidURL, TypeError):
        raise LLMConfigurationError("Invalid local LLM endpoint.") from None
    host = url.host.lower()
    local = host in _LOCAL_HOSTS
    if not local:
        try:
            address = ip_address(host)
            local = address.is_loopback or any(address in network for network in _LAN_NETWORKS)
        except ValueError:
            pass
    if (
        not local
        or url.scheme not in {"http", "https"}
        or url.userinfo
        or url.path not in {"", "/"}
        or url.query
        or url.fragment
    ):
        raise LLMConfigurationError("LLM endpoint must be a local Ollama origin.")
    return url.copy_with(path="/api/generate")


class OllamaClient:
    """Chi tiết triển khai HTTP; mỗi request sở hữu một client và tự đóng client đó.

    Custom transport chỉ là điểm nối cho test, không phải nhà cung cấp AI thay thế.
    Tắt proxy từ môi trường và redirect để prompt luôn ở nội bộ. Không tự động thử
    lại vì có thể vượt deadline của worker.
    """

    def __init__(
        self,
        *,
        model: str,
        base_url: str = "http://127.0.0.1:11434",
        keep_alive: str | int = "5m",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if (
            not isinstance(model, str)
            or not model.strip()
            or model != model.strip()
            or ":cloud" in model.lower()
            or "-cloud" in model.lower()
        ):
            raise LLMConfigurationError("A local Ollama model name is required.")
        if (
            isinstance(keep_alive, bool)
            or not isinstance(keep_alive, (str, int))
            or (isinstance(keep_alive, str) and not keep_alive.strip())
        ):
            raise LLMConfigurationError("Invalid model keep_alive setting.")
        self._url = _local_url(base_url)
        self.model = model
        self.keep_alive = keep_alive
        self._transport = transport

    async def generate(
        self,
        *,
        prompt: str,
        schema: Mapping[str, Any],
        timeout_seconds: float,
    ) -> bytes:
        """Gửi request cấu trúc không streaming và trả envelope thô."""
        try:
            async with httpx.AsyncClient(
                transport=self._transport,
                trust_env=False,
                follow_redirects=False,
            ) as client:
                response = await client.post(
                    self._url,
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "format": dict(schema),
                        "stream": False,
                        "keep_alive": self.keep_alive,
                        "options": {"temperature": 0},
                    },
                    timeout=timeout_seconds,
                )
                if not response.is_success:
                    raise LLMHTTPError(response.status_code)
                return response.content
        except httpx.TimeoutException:
            raise LLMTimeoutError("Local LLM request timed out.") from None
        except httpx.RequestError:
            raise LLMConnectionError("Local LLM connection failed.") from None
