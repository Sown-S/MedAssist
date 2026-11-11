"""Kiểm tính công bằng và cách đếm thành công của probe AI-23; không DB/LLM thật."""

import asyncio
from copy import deepcopy
import json

from app.ai.extraction import feature_extractor as extractor
from app.ai.llm.client import LLMHTTPError
from app.ai.pipeline.node1_red_flag_gate import run_node1
from tests.unit.ai.fakes import FakeKnowledgeReader, MockLLMClient
from tests.unit.ai.manual_catalogue_cache_probe import fixed_catalogue, summarise
from tests.unit.ai.manual_extraction_probe import compare_result


def test_fixed_order_preserves_full_catalogue_and_static_prefix(monkeypatch):
    rows = [{"symptom_code": f"signal_{i:02d}", "symptom_name": f"Biểu hiện {i}"}
            for i in range(30)]
    rows[0]["symptom_name"] = "Ho khan"
    rows[-1]["symptom_name"] = "Đau nhức đầu"
    original = deepcopy(rows)
    reader = FakeKnowledgeReader(symptoms=list(reversed(rows)))
    gate = run_node1({"input_features": {"symptoms": {}}}, reader)
    # Cả hai lời kể còn dấu sau che PII để chỉ so ảnh hưởng thứ tự catalog.
    notes = ("Có ho khan; họ tên: NGUOI_THU_NGHIEM", "Đau nhức đầu")
    baseline_orders = [
        [row["symptom_code"] for row in extractor._select_prompt_catalogue(rows, note)] for note in notes
    ]
    assert baseline_orders[0] != baseline_orders[1]
    monkeypatch.setattr(extractor, "_select_prompt_catalogue", fixed_catalogue)
    calls = []
    for note in notes:
        client = MockLLMClient({"symptoms": []})
        asyncio.run(extractor.extract_symptoms(
            note, reader, client, object(), gate_state=gate,
            identifiers=["NGUOI_THU_NGHIEM"], timeout_seconds=30,
        ))
        assert len(client.calls) == 1
        calls.append(client.calls[0])
    payloads = [json.loads(call["prompt"].rsplit("\n", 1)[-1]) for call in calls]
    assert all(list(payload) == ["catalogue", "text"] for payload in payloads)
    assert all(payload["catalogue"] == {row["symptom_code"]: row["symptom_name"] for row in rows}
               for payload in payloads)
    assert calls[0]["prompt"].rsplit(', "text": ', 1)[0] == calls[1]["prompt"].rsplit(', "text": ', 1)[0]
    assert calls[0]["schema"] == calls[1]["schema"]
    assert "NGUOI_THU_NGHIEM" not in calls[0]["prompt"]
    assert "[REDACTED]" in payloads[0]["text"]
    assert rows == original


def test_http_error_returning_empty_is_not_success(monkeypatch):
    reader = FakeKnowledgeReader(symptoms=[{"symptom_code": "cough", "symptom_name": "Ho"}])
    gate = run_node1({"input_features": {"symptoms": {}}}, reader)
    monkeypatch.setattr(extractor, "_select_prompt_catalogue", fixed_catalogue)
    client = MockLLMClient(error=LLMHTTPError(400))
    result = asyncio.run(extractor.extract_symptoms(
        "Không cung cấp triệu chứng.", reader, client, object(), gate_state=gate,
        identifiers=[], timeout_seconds=30,
    ))
    assert result == []
    compared = compare_result({}, {}, completed=False)
    row = {"seconds": 0.2, "successful": False, "empty": True,
           "context_error": True, "error_type": "LLMHTTPError",
           "correct_expected": 0, "expected_count": 0, **compared}
    summary = summarise([row])
    assert summary["exact_cases"] == summary["successful"] == 0
    assert summary["context_errors"] == summary["empty_cases"] == 1
    assert summary["successful_requests_latency"] == {"p50_s": None, "p95_s": None, "max_s": None}
    assert summary["code_state_recall"] is None


def test_summary_keeps_timeout_and_failures_in_all_request_latency():
    def row(seconds, success, correct, *, exact=False, error=None):
        return {"seconds": seconds, "successful": success, "empty": not success,
                "context_error": False, "error_type": error, "correct_expected": correct,
                "expected_count": 2, "exact_match": exact}
    summary = summarise([
        row(2, True, 2, exact=True), row(10, True, 1),
        row(30.02, False, 0, error="LLMTimeoutError"),
    ])
    assert summary["successful"] == 2
    assert summary["over_30s"] == 1
    assert summary["code_state_recall"] == 0.5
    assert summary["all_requests_latency"] == {"p50_s": 10, "p95_s": 30.02, "max_s": 30.02}
    assert summary["successful_requests_latency"] == {"p50_s": 2, "p95_s": 10, "max_s": 10}
