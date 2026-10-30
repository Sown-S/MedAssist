"""Kiểm tra timeout test bằng HTTP giả, không truy cập DB hay Ollama thật."""

import asyncio
import json

import httpx
import pytest

from app.ai.llm.client import LLMClient, LLMTimeoutError
from app.ai.test_mode import assessment_timeout_disabled, unlimited_assessment


def test_switch_requires_explicit_opt_in(monkeypatch):
    monkeypatch.delenv("MEDASSIST_TEST_NO_ASSESSMENT_TIMEOUT", raising=False)
    assert not assessment_timeout_disabled()
    monkeypatch.setenv("MEDASSIST_TEST_NO_ASSESSMENT_TIMEOUT", "1")
    assert assessment_timeout_disabled()


@pytest.mark.parametrize("disabled", [False, True])
def test_slow_llm_and_http_timeout(disabled):
    async def scenario():
        async def respond(request):
            if disabled:
                assert all(v is None for v in request.extensions["timeout"].values())
            await asyncio.sleep(0.03)
            return httpx.Response(200, json={"done": True, "response": json.dumps({"ok": True})})

        client = LLMClient(model="test", transport=httpx.MockTransport(respond))
        token = unlimited_assessment.set(disabled)
        try:
            call = client.generate_json(prompt="synthetic", schema={"type": "object"}, timeout_seconds=0.001)
            if disabled:
                assert await call == {"ok": True}
            else:
                with pytest.raises(LLMTimeoutError):
                    await call
        finally:
            unlimited_assessment.reset(token)
        assert not unlimited_assessment.get()

    asyncio.run(scenario())


def test_unlimited_llm_can_still_be_cancelled():
    async def scenario():
        entered = asyncio.Event()

        async def respond(request):
            entered.set()
            await asyncio.Event().wait()

        token = unlimited_assessment.set(True)
        try:
            client = LLMClient(model="test", transport=httpx.MockTransport(respond))
            task = asyncio.create_task(client.generate_json(
                prompt="synthetic", schema={"type": "object"}, timeout_seconds=1))
            await asyncio.wait_for(entered.wait(), 1)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        finally:
            unlimited_assessment.reset(token)

    asyncio.run(scenario())


@pytest.mark.parametrize("rowcount", [1, 0])
def test_lease_heartbeat_and_cleanup(monkeypatch, rowcount):
    from contextlib import contextmanager
    from types import SimpleNamespace
    from uuid import uuid4
    from app.worker import test_mode

    monkeypatch.setenv("MEDASSIST_TEST_NO_ASSESSMENT_TIMEOUT", "1")
    monkeypatch.setattr(test_mode, "settings", SimpleNamespace(WORKER_LEASE_SECONDS=0.03))
    calls = []

    @contextmanager
    def session():
        class DB:
            def execute(self, statement):
                calls.append(statement)
                return SimpleNamespace(rowcount=rowcount)

            def commit(self):
                pass
        yield DB()

    async def scenario():
        async def job():
            async with test_mode.assessment_test_mode(uuid4(), 2, session):
                assert unlimited_assessment.get()
                await asyncio.sleep(0.06)
            assert not unlimited_assessment.get()

        task = asyncio.create_task(job())
        if rowcount:
            await task
        else:
            with pytest.raises(asyncio.CancelledError):
                await task
        assert calls
        count = len(calls)
        await asyncio.sleep(0.03)
        assert len(calls) == count

    asyncio.run(scenario())
