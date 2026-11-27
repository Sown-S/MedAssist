"""Thời hạn chờ tính từ queued_at, thời hạn chạy tính từ lúc worker nhận việc; không dùng DB hay Ollama."""

import datetime
from types import SimpleNamespace

import pytest

from app.worker import runner

QUEUED_AT = datetime.datetime(2026, 10, 30, tzinfo=datetime.UTC)


@pytest.fixture(autouse=True)
def limits(monkeypatch):
    monkeypatch.setattr(runner, "settings", SimpleNamespace(
        AI_QUEUE_WAIT_SECONDS=90, AI_ASSESSMENT_TIMEOUT_SECONDS=90, WORKER_LEASE_SECONDS=150,
    ))


def _budget(waited: float, limit: float | None = None) -> float:
    return runner._run_budget(QUEUED_AT, QUEUED_AT + datetime.timedelta(seconds=waited), limit)


@pytest.mark.parametrize("limit,budget", [(None, 90), (30, 30)])
@pytest.mark.parametrize("waited", [0, 60, 89.9, -5])
def test_wait_within_limit_keeps_full_run_budget(limit, budget, waited):
    assert _budget(waited, limit) == budget


@pytest.mark.parametrize("limit", [None, 30])
@pytest.mark.parametrize("waited", [90, 91, 190])
def test_wait_reaching_limit_gets_no_run_budget(limit, waited):
    assert _budget(waited, limit) == 0


@pytest.mark.parametrize("limit", [None, 30])
def test_reclaim_after_lease_expiry_gets_no_run_budget(limit):
    assert _budget(runner.settings.WORKER_LEASE_SECONDS, limit) == 0


@pytest.mark.parametrize("limit", [0, -1])
def test_nonpositive_budget_stays_exhausted(limit):
    assert _budget(0, limit) == 0


def test_remaining_budget_counts_down_from_deadline(monkeypatch):
    monkeypatch.setattr(runner.time, "monotonic", lambda: 1000.0)
    assert runner._remaining_budget(1030.0) == 30
    assert runner._remaining_budget(1000.0) == 0
    assert runner._remaining_budget(970.0) == 0
