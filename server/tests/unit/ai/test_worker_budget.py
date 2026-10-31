"""Ngân sách worker tính cả thời gian chờ; không dùng DB hay Ollama."""

import datetime
from types import SimpleNamespace

import pytest

from app.worker import runner


@pytest.fixture
def now(monkeypatch):
    fixed = datetime.datetime(2026, 10, 30, tzinfo=datetime.UTC)

    class Clock:
        @staticmethod
        def now(tz):
            assert tz == datetime.UTC
            return fixed

    monkeypatch.setattr(runner, "datetime", SimpleNamespace(datetime=Clock, UTC=datetime.UTC))
    monkeypatch.setattr(runner, "settings", SimpleNamespace(
        AI_ASSESSMENT_TIMEOUT_SECONDS=90, WORKER_LEASE_SECONDS=120,
    ))
    return fixed


@pytest.mark.parametrize("limit,budget", [(None, 90), (30, 30)])
@pytest.mark.parametrize("stage", ["new", "near", "deadline", "expired", "future"])
def test_queue_wait_consumes_budget(now, limit, budget, stage):
    waited, expected = {
        "new": (0, budget),
        "near": (budget - 0.5, 0.5),
        "deadline": (budget, 0),
        "expired": (budget + 100, 0),
        "future": (-5, budget),
    }[stage]
    queued_at = now - datetime.timedelta(seconds=waited)
    assert runner._remaining_budget(queued_at, limit) == pytest.approx(expected)


@pytest.mark.parametrize("limit", [0, -1])
def test_nonpositive_budget_stays_exhausted(now, limit):
    assert runner._remaining_budget(now, limit) == 0


def test_test_override_does_not_replenish_extraction_budget(now, monkeypatch):
    monkeypatch.setenv("MEDASSIST_TEST_NO_ASSESSMENT_TIMEOUT", "1")
    queued_at = now - datetime.timedelta(seconds=60)
    assert runner._remaining_budget(queued_at, 30) == 0
