"""Đo recall truy xuất trên bộ phát triển riêng và snapshot Active; không gọi LLM."""

from dataclasses import asdict
from hashlib import sha256
import json
import math
from pathlib import Path
import re
from time import monotonic

from app.ai.extraction.candidate_index import CandidateIndexCache, INDEX_VERSION
from app.ai.extraction.phrase_retrieval import retrieve_phrases
from app.ai.extraction.phrase_splitter import SPLITTER_VERSION
from app.ai.pipeline.node1_red_flag_gate import run_node1
from app.ai.snapshot_reader import SnapshotReader

DEVELOPMENT_CASES = Path(__file__).parent / "data" / "extraction_retrieval_dev_v1.jsonl"
LIMITS = (4, 8, 12, 16, 24)


def load_cases():
    cases = [json.loads(line) for line in DEVELOPMENT_CASES.read_text(encoding="utf-8").splitlines() if line]
    assert len({case["id"] for case in cases}) == len(cases), "DUPLICATE_DEVELOPMENT_CASE_ID"
    for case in cases:
        assert {mention["code"] for mention in case["expected_mentions"]} == set(case["expected_symptoms"])
        for mention in case["expected_mentions"]:
            assert mention["text"] in case["clinical_note"], "INVALID_DEVELOPMENT_MENTION"
    return cases


def measure_mentions(plan, mentions):
    """Mẫu số gồm mọi nhãn đã ghi trước, kể cả cụm bị splitter bỏ sót.

    Nếu một mention trải qua nhiều cụm thì hợp các danh sách chồng lấn span của
    chính mention đó. Báo riêng recall hợp toàn lời kể; không gọi đây là recall
    end-to-end của Gemma hoặc độ đúng trạng thái PRESENT/ABSENT/UNKNOWN.
    """
    ranks, missing = [], []
    for mention in mentions:
        start = plan.masked_text.find(mention["text"])
        if start < 0:
            raise ValueError("Development mention missing after redaction.")
        end = start + len(mention["text"])
        matching = [
            rank for group in plan.groups
            if group.phrase.start < end and group.phrase.end > start
            for rank, candidate in enumerate(group.candidates, 1)
            if candidate.symptom_code == mention["code"]
        ]
        ranks.append(min(matching) if matching else None)
        if not matching:
            missing.append(mention["code"])
    return ranks, missing


def percentile(values, fraction):
    return sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)] if values else None


def emit(row):
    print(json.dumps(row, ensure_ascii=True, allow_nan=False), flush=True)


def main():
    from app.core.database import engine
    from app.services.knowledge_reader import DbKnowledgeReader, load_snapshot

    bind = engine.execution_options(postgresql_readonly=True)
    snapshot = DbKnowledgeReader(bind).refresh()
    fingerprint = sha256(json.dumps(asdict(snapshot), sort_keys=True, default=str).encode()).hexdigest()
    reader = SnapshotReader(snapshot)
    cache = CandidateIndexCache()
    cases = load_cases()
    started = monotonic()
    index = cache.get(reader)
    build_ms = (monotonic() - started) * 1000
    started = monotonic()
    assert cache.get(reader) is index
    cache_hit_ms = (monotonic() - started) * 1000
    active_codes = {doc.code for doc in index.documents}
    assert {code for case in cases for code in case["expected_symptoms"]} <= active_codes, "DEVELOPMENT_CODE_NOT_ACTIVE"
    linked_codes = {item["symptom_code"] for condition in snapshot.conditions for item in condition["symptoms"]}
    emit({"type": "metadata", "index_version": INDEX_VERSION, "splitter_version": SPLITTER_VERSION,
          "release": snapshot.release, "catalogue_count": len(index.documents), "snapshot_sha256": fingerprint,
          "catalogue_sha256": index.catalogue_sha256, "development_cases": len(cases),
          "dataset_sha256": sha256(DEVELOPMENT_CASES.read_bytes()).hexdigest(), "limits": LIMITS,
          "build_ms": build_ms, "cache_hit_ms": cache_hit_ms, "llm_calls": 0,
          "unlinked_codes_indexed": len(active_codes - linked_codes),
          "scope": "development retrieval only; no frozen cases, Gemma or worker E2E"})
    # Sanity cho cả catalog, không coi truy vấn chính tên catalog là đánh giá diễn đạt tự nhiên.
    name_hits = sum(doc.code in {candidate.symptom_code for candidate in index.search(doc.name, limit=4)}
                    for doc in index.documents)
    emit({"type": "catalogue_name_sanity", "k": 4, "hits": name_hits, "total": len(index.documents)})
    for limit in LIMITS:
        results = []
        for case in cases:
            gate = run_node1({"input_features": {"symptoms": {}}}, reader)
            assert gate["is_red_flag"] is False and gate["ai_status"] != "Skipped"
            started = monotonic()
            plan = retrieve_phrases(case["clinical_note"], reader, cache, identifiers=[],
                                    per_phrase_limit=limit, deadline=started + 30)
            milliseconds = (monotonic() - started) * 1000
            assert plan.snapshot_key == index.snapshot_key
            ranks, missing = measure_mentions(plan, case["expected_mentions"])
            union = {candidate.symptom_code for group in plan.groups for candidate in group.candidates}
            covered = all(any(group.phrase.start <= word.start() and group.phrase.end >= word.end()
                              for group in plan.groups) for word in re.finditer(r"\w+", plan.masked_text))
            row = {"type": "case", "case": case["id"], "k": limit, "tags": case["tags"],
                   "retrieval_ms": milliseconds, "phrases": len(plan.groups), "word_coverage": covered,
                   "mentions": len(ranks), "mention_hits": sum(rank is not None for rank in ranks),
                   "mention_ranks": ranks, "missing_mentions": missing,
                   "expected_codes": len(case["expected_symptoms"]),
                   "union_hits": len(union & set(case["expected_symptoms"])), "union_count": len(union),
                   "groups_without_candidates": sum(not group.candidates for group in plan.groups)}
            results.append(row)
            emit(row)
        mentions = sum(row["mentions"] for row in results)
        expected = sum(row["expected_codes"] for row in results)
        emit({"type": "summary", "k": limit, "cases": len(results), "mentions": mentions,
              "mention_hits": sum(row["mention_hits"] for row in results),
              "mention_recall": sum(row["mention_hits"] for row in results) / mentions,
              "code_union_recall": sum(row["union_hits"] for row in results) / expected,
              "p50_ms": percentile([row["retrieval_ms"] for row in results], 0.5),
              "p95_ms": percentile([row["retrieval_ms"] for row in results], 0.95),
              "max_ms": max(row["retrieval_ms"] for row in results),
              "mean_union_count": sum(row["union_count"] for row in results) / len(results),
              "max_union_count": max(row["union_count"] for row in results),
              "all_words_covered": all(row["word_coverage"] for row in results),
              "missing_cases": [row["case"] for row in results if row["missing_mentions"]]})
    final = sha256(json.dumps(asdict(load_snapshot(bind)), sort_keys=True, default=str).encode()).hexdigest()
    assert final == fingerprint, "ACTIVE_SNAPSHOT_CHANGED"
    emit({"type": "complete", "snapshot_unchanged": True, "llm_calls": 0})


if __name__ == "__main__":
    main()
