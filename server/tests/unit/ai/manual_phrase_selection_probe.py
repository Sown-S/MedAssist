"""Đo Gemma một lượt trên bộ phát triển riêng; chỉ đọc DB, không ghi prompt/PII."""

import argparse
import asyncio
from collections import Counter
from dataclasses import asdict
from hashlib import sha256
import json
from pathlib import Path
from time import monotonic

from sqlalchemy.orm import Session

from app.ai.extraction.candidate_index import CandidateIndexCache
from app.ai.extraction.phrase_retrieval import retrieve_phrases
from app.ai.extraction.dispatch import ExtractionOptions, run_extraction
from app.ai.extraction.selection_groups import SELECTION_GROUPS_VERSION, group_for_selection
from app.ai.llm.client import LLMError
from app.ai.llm.prompts import PHRASE_EXTRACTION_PROMPT_VERSION
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.ai.snapshot_reader import SnapshotReader
from tests.unit.ai.manual_catalogue_cache_probe import MeasuredClient
from tests.unit.ai.manual_phrase_retrieval_probe import load_cases, percentile


class SelectionClient(MeasuredClient):
    async def generate_json(self, **kwargs):
        self.calls += 1
        payload = json.loads(kwargs["prompt"].rsplit("\n", 1)[-1])
        self.prompt_info = {"candidate_count": len(payload["catalogue"]), "groups": len(payload["groups"]),
                            "candidate_codes_by_group": {key: value["codes"] for key, value in payload["groups"].items()},
                            "request_bytes": len(kwargs["prompt"].encode()) + len(json.dumps(kwargs["schema"]).encode())}
        try:
            result = await self.client.generate_json(**kwargs)
        except (LLMError, TimeoutError) as exc:
            self.error_type = type(exc).__name__
            raise
        self.completed = True
        # Chỉ metadata mã/trạng thái thuộc catalog, không lưu output thô/chuỗi tự do.
        self.selection_codes = {}
        if isinstance(result, dict):
            for key in payload["groups"]:
                value = result.get(key)
                if isinstance(value, list):
                    self.selection_codes[key] = [
                        {"code": item["symptom_code"], "status": item["status"]} for item in value
                        if isinstance(item, dict) and isinstance(item.get("symptom_code"), str)
                        and item["symptom_code"] in payload["catalogue"]
                        and item.get("status") in ("PRESENT", "ABSENT", "UNKNOWN")
                    ]
        return result


def emit(row):
    print(json.dumps(row, ensure_ascii=True, allow_nan=False), flush=True)


async def main(case_ids=None, limit=4, extended=False, retrieval_only=False, cases_file=None):
    from app.core.config import settings
    from app.core.database import engine
    from app.services.knowledge_reader import DbKnowledgeReader, load_snapshot

    assert "gemma" in settings.OLLAMA_MODEL.lower() and "sea-lion" in settings.OLLAMA_MODEL.lower()
    bind = engine.execution_options(postgresql_readonly=True)
    snapshot = DbKnowledgeReader(bind).refresh()
    def fingerprint(value):
        return sha256(json.dumps(asdict(value), sort_keys=True, default=str).encode()).hexdigest()
    initial = fingerprint(snapshot)
    reader, cache = SnapshotReader(snapshot), CandidateIndexCache()
    cases = (load_cases() if cases_file is None else
             [json.loads(line) for line in cases_file.read_text(encoding="utf-8").splitlines() if line])
    assert cases and len({case["id"] for case in cases}) == len(cases), "INVALID_DEVELOPMENT_CASE_IDS"
    if extended:
        extra = Path(__file__).parent / "data" / "extraction_selection_extra_v1.jsonl"
        cases += [json.loads(line) for line in extra.read_text(encoding="utf-8").splitlines() if line]
    if case_ids:
        assert set(case_ids) <= {case["id"] for case in cases}, "UNKNOWN_DEVELOPMENT_CASE"
        cases = [case for case in cases if case["id"] in case_ids]
    active = {row["symptom_code"] for row in snapshot.symptoms}
    assert {code for case in cases for code in case["expected_symptoms"]} <= active
    emit({"type": "metadata", "model": settings.OLLAMA_MODEL,
          "prompt_version": PHRASE_EXTRACTION_PROMPT_VERSION,
          "selection_groups_version": SELECTION_GROUPS_VERSION,
          "release": snapshot.release, "catalogue_count": len(active), "snapshot_sha256": initial,
          "cases": len(cases), "per_phrase_limit": limit, "scope": "development-only; queue wait=0; not worker E2E"})
    measurements = []
    for case in cases:
        assert fingerprint(load_snapshot(bind)) == initial, "ACTIVE_SNAPSHOT_CHANGED"
        if retrieval_only:
            plan = retrieve_phrases(case["clinical_note"], reader, cache, identifiers=[],
                                    per_phrase_limit=limit, deadline=monotonic() + 30)
            emit({"type": "retrieval_diagnostic", "case": case["id"], "calls": 0,
                  "selection_groups_changed": group_for_selection(plan).groups != plan.groups,
                  "expected_codes": sorted(case["expected_symptoms"]),
                  "groups": {group.phrase.phrase_id: [
                      {"code": item.symptom_code, "name": item.symptom_name} for item in group.candidates
                  ] for group in plan.groups}})
            continue
        client = SelectionClient(settings)
        gate = run_node1({"input_features": {"symptoms": {}}}, reader)
        started = monotonic()
        with Session(bind) as db:
            result = await run_extraction(
                case["clinical_note"], reader, client, db, gate_state=gate,
                identifiers=[], timeout_seconds=30, cache=cache,
                options=ExtractionOptions(strategy="phrases", per_phrase_limit=limit),
            )
            db.rollback()
        seconds = monotonic() - started
        actual = {row["symptom_code"]: row["status"] for row in result.suggestions}
        expected = case["expected_symptoms"]
        completed = result.completed and seconds < 30
        row = {"type": "case", "case": case["id"], "seconds": seconds, "completed": completed,
               "strategy": result.strategy, "prompt_version": result.prompt_version,
               "failure_code": result.failure_code, "calls": client.calls, "empty": not actual,
               "http_status": client.http_status, "context_error": client.context_error,
               "selected_codes_by_group": getattr(client, "selection_codes", {}),
               "metrics": client.metrics, **client.prompt_info,
               "expected_count": len(expected), "actual_count": len(actual),
               "correct_count": sum(actual.get(code) == status for code, status in expected.items()),
               "code_hits": len(set(actual) & set(expected)), "actual_statuses": actual,
               "missing_or_wrong": sorted(code for code, status in expected.items() if actual.get(code) != status),
               "unexpected": sorted(set(actual) - set(expected)),
               "exact_match": completed and actual == expected}
        measurements.append(row)
        emit(row)
        assert fingerprint(load_snapshot(bind)) == initial, "ACTIVE_SNAPSHOT_CHANGED"
    if retrieval_only:
        assert fingerprint(load_snapshot(bind)) == initial, "ACTIVE_SNAPSHOT_CHANGED"
        emit({"type": "complete", "snapshot_unchanged": True, "calls": 0})
        return
    expected_count = sum(row["expected_count"] for row in measurements)
    actual_count = sum(row["actual_count"] for row in measurements)
    correct = sum(row["correct_count"] for row in measurements)
    emit({"type": "summary", "cases": len(measurements), "completed": sum(row["completed"] for row in measurements),
          "exact_cases": sum(row["exact_match"] for row in measurements),
          "empty_cases": sum(row["empty"] for row in measurements),
          "over_30s": sum(row["seconds"] > 30 for row in measurements),
          "p50_s": percentile([row["seconds"] for row in measurements], 0.5),
          "p95_s": percentile([row["seconds"] for row in measurements], 0.95),
          "max_s": max(row["seconds"] for row in measurements),
          "expected_count": expected_count, "actual_count": actual_count, "correct_count": correct,
          "code_state_recall": correct / expected_count if expected_count else None,
          "code_state_precision": correct / actual_count if actual_count else None,
          "code_recall": sum(row["code_hits"] for row in measurements) / expected_count if expected_count else None,
          "failures": dict(Counter(row["failure_code"] for row in measurements if row["failure_code"]))})
    emit({"type": "complete", "snapshot_unchanged": True})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", action="append")
    parser.add_argument("--k", type=int, default=4)
    parser.add_argument("--extended", action="store_true")
    parser.add_argument("--retrieval-only", action="store_true")
    parser.add_argument("--cases-file", type=Path)
    args = parser.parse_args()
    if args.k <= 0:
        parser.error("--k must be positive")
    if args.cases_file and args.extended:
        parser.error("--cases-file and --extended cannot be combined")
    asyncio.run(main(args.case, args.k, args.extended, args.retrieval_only, args.cases_file))
