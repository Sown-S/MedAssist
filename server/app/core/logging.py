"""Cấu hình log thống nhất cho api (và worker sau này), kèm request_id của request hiện tại.

Không log dữ liệu bệnh nhân, mật khẩu, token. Log chỉ ghi: method, đường dẫn mẫu, mã trạng thái,
thời gian xử lý, request_id, user_id (nếu có).
"""
import logging
import logging.config
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def setup_logging(level: str = "INFO") -> None:
    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {"request_id": {"()": _RequestIdFilter}},
        "formatters": {
            "default": {"format": "%(asctime)s %(levelname)-7s [%(request_id)s] %(name)s: %(message)s"},
        },
        "handlers": {
            "console": {"class": "logging.StreamHandler", "formatter": "default",
                        "filters": ["request_id"]},
        },
        "loggers": {
            "medassist": {"handlers": ["console"], "level": level, "propagate": False},
            "uvicorn.error": {"handlers": ["console"], "level": level, "propagate": False},
            # access log mặc định của uvicorn bị thay bằng dòng log của RequestContextMiddleware
            "uvicorn.access": {"handlers": [], "level": "WARNING", "propagate": False},
            "sqlalchemy.engine": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        },
        "root": {"handlers": ["console"], "level": "WARNING"},
    })


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"medassist.{name}")
