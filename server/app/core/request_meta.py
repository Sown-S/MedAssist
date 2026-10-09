"""IP và user-agent của request, dùng cho AUDIT_LOG."""
import ipaddress
from functools import lru_cache

from fastapi import Request

from app.core.config import settings


@lru_cache
def _trusted_networks() -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    return tuple(ipaddress.ip_network(p, strict=False) for p in settings.TRUSTED_PROXIES)


def _is_trusted(host: str | None) -> bool:
    if not host:
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(ip in net for net in _trusted_networks())


def client_ip(request: Request) -> str | None:
    """IP thật của máy client.

    Chỉ đọc X-Forwarded-For khi request đến từ proxy tin cậy (Caddy); ngược lại ai cũng
    tự đặt header đó để giả IP trong nhật ký.
    """
    peer = request.client.host if request.client else None
    if _is_trusted(peer):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()[:45]
    return peer


def user_agent(request: Request) -> str | None:
    ua = request.headers.get("user-agent")
    return ua[:255] if ua else None