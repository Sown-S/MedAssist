"""AI-23: đo thứ tự catalog bằng ca phát triển, không đổi đường chạy production.

Chạy trong tiến trình worker riêng với source local. KnowledgeReader/validator chỉ
đọc DB, Node 1 chạy trước extraction. Không in prompt, lời kể hoặc output thô.
"""

import argparse
import asyncio
from collections import Counter
from dataclasses import asdict
from hashlib import sha256
import json
import math
from time import monotonic
from unittest.mock import patch

import httpx
from sqlalchemy.orm import Session

from app.ai.extraction import feature_extractor as extractor
from app.ai.llm.client import LLMClient, LLMError
from app.ai.pipeline.node1_red_flag_gate import run_node1
from tests.unit.ai.manual_extraction_probe import CASES, compare_result, valid_response

PROBE_VERSION = "catalogue-order-ab-v1"
METRIC_KEYS = (
    "prompt_eval_count", "prompt_eval_duration", "eval_count", "eval_duration",
    "load_duration", "total_duration", "done_reason",
)


def fixed_catalogue(catalogue, text):
    """Giữ đủ mã/tên, chỉ đổi thứ tự; không phụ thuộc lời kể."""
    return sorted(catalogue, key=lambda row: row["symptom_code"])


def fingerprint(snapshot):
    return sha256(json.dumps(asdict(snapshot), sort_keys=True, default=str).encode()).hexdigest()


def percentile(values, fraction):
    """Nearest-rank; chỉ dùng mô tả mẫu probe, không chứng nhận p95 vận hành."""
    return sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)] if values else None


def latency_summary(values):
    return {"p50_s": percentile(values, 0.5), "p95_s": percentile(values, 0.95),
            "max_s": max(values) if values else None}


def summarise(rows):
    """Tách thời gian trả lỗi khỏi thời gian suy luận thành công."""
    successful = [row for row in rows if row["successful"]]
    return {
        "cases": len(rows), "successful": len(successful),
        "exact_cases": sum(row["exact_match"] for row in rows),
        "empty_cases": sum(row["empty"] for row in rows),
        "over_30s": sum(row["seconds"] > 30 for row in rows),
        "context_errors": sum(row["context_error"] for row in rows),
        "errors": dict(Counter(row["error_type"] for row in rows if row["error_type"])),
        "all_requests_latency": latency_summary([row["seconds"] for row in rows]),
        "successful_requests_latency": latency_summary([row["seconds"] for row in successful]),
        "code_state_recall": (
            sum(row["correct_expected"] for row in rows) / sum(row["expected_count"] for row in rows)
            if sum(row["expected_count"] for row in rows) else None
        ),
    }


class MeasuredClient:
    """Gọi qua client chuẩn, chỉ giữ metadata không chứa lời kể/prompt."""

    def __init__(self, settings):
        self.calls = 0
        self.completed = False
        self.valid_output = False
        self.error_type = None
        self.http_status = None
        self.context_error = False
        self.metrics = {}
        self.prompt_info = {}
        owner = self

        class DiagnosticTransport(httpx.AsyncHTTPTransport):
            async def handle_async_request(self, request):
                response = await super().handle_async_request(request)
                await response.aread()
                owner.http_status = response.status_code
                try:
                    envelope = response.json()
                except ValueError:
                    envelope = {}
                if isinstance(envelope, dict):
                    if response.is_success:
                        owner.metrics = {key: envelope.get(key) for key in METRIC_KEYS}
                    else:
                        owner.context_error = "context" in str(envelope.get("error", "")).lower()
                return response

        self.client = LLMClient(
            model=settings.OLLAMA_MODEL, base_url=settings.OLLAMA_BASE_URL,
            keep_alive=settings.OLLAMA_KEEP_ALIVE, transport=DiagnosticTransport(),
        )

    async def generate_json(self, **kwargs):
        self.calls += 1
        prompt = kwargs["prompt"]
        instruction, raw_payload = prompt.rsplit("\n", 1)
        payload = json.loads(raw_payload)
        assert list(payload) == ["catalogue", "text"], "TEXT_MUST_BE_LAST"
        # Chỉ băm phần tĩnh; không băm/lưu lời kể hoặc toàn prompt.
        prefix = instruction + "\n" + json.dumps(
            {"catalogue": payload["catalogue"]}, ensure_ascii=False, allow_nan=False,
        )[:-1] + ', "text": '
        assert prompt.startswith(prefix), "INVALID_PREFIX_BOUNDARY"
        self.prompt_info = {
            "catalogue_count": len(payload["catalogue"]),
            "prefix_sha256": sha256(prefix.encode()).hexdigest(),
            "schema_sha256": sha256(json.dumps(kwargs["schema"], sort_keys=True).encode()).hexdigest(),
            "text_last": True,
        }
        try:
            result = await self.client.generate_json(**kwargs)
        except (LLMError, TimeoutError) as exc:
            self.error_type = type(exc).__name__
            raise
        self.completed = True
        self.valid_output = valid_response(result, set(payload["catalogue"]))
        return result


def emit(row):
    print(json.dumps(row, ensure_ascii=True, allow_nan=False), flush=True)


async def main(repeat=2):
    from app.core.config import settings
    from app.core.database import engine
    from app.services.knowledge_reader import DbKnowledgeReader, load_snapshot

    assert "gemma" in settings.OLLAMA_MODEL.lower() and "sea-lion" in settings.OLLAMA_MODEL.lower()
    bind = engine.execution_options(postgresql_readonly=True)
    reader = DbKnowledgeReader(bind)
    initial = fingerprint(reader.refresh())
    rows = extractor._catalogue(reader)
    assert {code for _, _, expected in CASES for code in expected} <= {
        row["symptom_code"] for row in rows
    }, "DEVELOPMENT_CODES_NOT_ACTIVE"
    emit({"type": "metadata", "probe_version": PROBE_VERSION,
          "model": settings.OLLAMA_MODEL, "prompt_version": extractor.EXTRACTION_PROMPT_VERSION,
          "release": reader.active_release(), "catalogue_count": len(rows),
          "snapshot_sha256": initial, "repeats": repeat, "development_cases": len(CASES),
          "queue_wait_seconds": 0, "scope": "development-only; not frozen evaluation or worker E2E",
          "variant_change": "order only; existing accent policy and text-last layout retained"})
    baseline = extractor._select_prompt_catalogue
    results = {"baseline": [], "fixed": []}
    for iteration in range(1, repeat + 1):
        # Đảo thứ tự hai block ở lượt sau để không luôn ưu tiên cùng một nhánh.
        variants = ("baseline", "fixed") if iteration % 2 else ("fixed", "baseline")
        for variant in variants:
            selector = baseline if variant == "baseline" else fixed_catalogue
            for case_id, note, expected in CASES:
                assert fingerprint(load_snapshot(bind)) == initial, "ACTIVE_SNAPSHOT_CHANGED"
                gate = run_node1({"input_features": {"symptoms": {}}}, reader)
                client = MeasuredClient(settings)
                started = monotonic()
                with Session(bind) as db, patch.object(extractor, "_select_prompt_catalogue", selector):
                    result = await extractor.extract_symptoms(
                        note, reader, client, db, gate_state=gate,
                        identifiers=[], timeout_seconds=30,
                    )
                    db.rollback()
                seconds = monotonic() - started
                actual = {row["symptom_code"]: row["status"] for row in result}
                successful = client.completed and client.valid_output and seconds < 30
                row = {
                    "type": "case", "variant": variant, "iteration": iteration, "case": case_id,
                    "seconds": seconds, "successful": successful, "empty": not result,
                    "calls": client.calls, "completed": client.completed, "valid_output": client.valid_output,
                    "error_type": client.error_type, "http_status": client.http_status,
                    "context_error": client.context_error, "metrics": client.metrics,
                    **client.prompt_info,
                    "expected_count": len(expected),
                    "correct_expected": sum(actual.get(code) == state for code, state in expected.items()),
                    **compare_result(actual, expected, completed=successful),
                }
                results[variant].append(row)
                emit(row)
                assert fingerprint(load_snapshot(bind)) == initial, "ACTIVE_SNAPSHOT_CHANGED"
    for variant, measurements in results.items():
        emit({"type": "summary", "variant": variant, **summarise(measurements)})
    emit({"type": "complete", "snapshot_unchanged": True,
          "selector_restored": extractor._select_prompt_catalogue is baseline})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeat", type=int, default=2)
    args = parser.parse_args()
    if args.repeat < 1:
        parser.error("--repeat must be positive")
    asyncio.run(main(args.repeat))
