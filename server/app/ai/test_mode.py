"""Công tắc test thủ công; mặc định vẫn giữ timeout của hệ thống."""

import os
from contextvars import ContextVar

unlimited_assessment: ContextVar[bool] = ContextVar("unlimited_assessment", default=False)


def assessment_timeout_disabled() -> bool:
    return os.environ.get("MEDASSIST_TEST_NO_ASSESSMENT_TIMEOUT") == "1"
