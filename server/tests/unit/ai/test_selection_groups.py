"""Ghép nhóm phối hợp giữ nguyên span, ứng viên, ngữ cảnh và masking."""

from time import monotonic
import json
from pathlib import Path

import pytest

from app.ai.extraction.candidate_index import CandidateIndexCache
from app.ai.extraction.phrase_retrieval import retrieve_phrases
from app.ai.extraction.selection_groups import group_for_selection
from tests.unit.ai.fakes import FakeKnowledgeReader


def plan(text, limit=1, identifiers=()):
    reader = FakeKnowledgeReader(symptoms=[
        {"symptom_code": "cough", "symptom_name": "Ho khan"},
        {"symptom_code": "wheeze", "symptom_name": "Thở khò khè"},
        {"symptom_code": "fever", "symptom_name": "Sốt cao"},
        {"symptom_code": "headache", "symptom_name": "Đau đầu"},
        {"symptom_code": "itch", "symptom_name": "Ngứa da"},
    ])
    return retrieve_phrases(text, reader, CandidateIndexCache(), identifiers=identifiers,
                            per_phrase_limit=limit, deadline=monotonic() + 5)


@pytest.mark.parametrize("note", ["Không ho khan và thở khò khè.",
    "Khong ho khan VA tho kho khe.", "Ho khan và không thở khò khè."])
def test_coordination_keeps_whole_phrase_and_both_candidate_lists(note):
    raw = plan(note)
    grouped = group_for_selection(raw, shared_negation_only=False)
    assert len(raw.groups) == 2 and len(grouped.groups) == 1
    assert {c.symptom_code for c in grouped.groups[0].candidates} == {"cough", "wheeze"}
    phrase = grouped.groups[0].phrase
    assert phrase.text == note[:-1] == grouped.masked_text[phrase.start:phrase.end]
    assert phrase.context == note[:-1] and not hasattr(phrase, "status")
    assert grouped.snapshot_key == raw.snapshot_key
    assert grouped.catalogue_sha256 == raw.catalogue_sha256


@pytest.mark.parametrize("boundary", ["; và", ". Và", ", và", " nhưng", " kèm", "\nVà"])
def test_does_not_merge_across_other_boundaries(boundary):
    raw = plan(f"Không ho khan{boundary} thở khò khè.")
    grouped = group_for_selection(raw)
    assert len(grouped.groups) == len(raw.groups) == 2


def test_long_list_keeps_candidates_beyond_per_phrase_limit_and_deduplicates():
    raw = plan("Ho khan và thở khò khè và sốt cao và đau đầu và ngứa da và ho khan.")
    grouped = group_for_selection(raw, shared_negation_only=False)
    assert len(grouped.groups) == 1
    codes = [c.symptom_code for c in grouped.groups[0].candidates]
    assert len(codes) == 5 and len(codes) == len(set(codes))
    assert set(codes) == {c.symptom_code for g in raw.groups for c in g.candidates}


def test_ids_are_contiguous_and_redacted_text_is_not_in_repr():
    raw = plan("PRIVATE_NAME; ho khan và thở khò khè; sốt cao.", identifiers=["PRIVATE_NAME"])
    grouped = group_for_selection(raw, shared_negation_only=False)
    assert [g.phrase.phrase_id for g in grouped.groups] == ["p1", "p2", "p3"]
    assert "PRIVATE_NAME" not in grouped.masked_text
    assert "khò khè" not in repr(grouped)
    assert group_for_selection(grouped) == grouped


@pytest.mark.parametrize("note,merged", [
    ("Không ho khan và thở khò khè.", True),
    ("Khong ho khan va tho kho khe.", True),
    ("Không ho khan và không thở khò khè.", False),
    ("Không ho khan và có thở khò khè.", False),
    ("Không ho khan và chưa rõ có thở khò khè.", False),
    ("Ho khan và thở khò khè.", False),
    ("Chưa rõ có ho khan hay không và thở khò khè.", False),
    ("Không ho khan và thở khò khè và sốt cao.", False),
    ("Không ho khan và thở khò khè và có sốt cao.", False),
])
def test_default_only_groups_dependent_negation_scope(note, merged):
    raw = plan(note)
    grouped = group_for_selection(raw)
    assert len(grouped.groups) == (1 if merged else len(raw.groups))
    assert {c.symptom_code for g in grouped.groups for c in g.candidates} == {
        c.symptom_code for g in raw.groups for c in g.candidates}


def test_overlapping_windows_keep_all_words_and_candidates():
    raw = plan(" ".join(["và ho khan"] * 30))
    grouped = group_for_selection(raw)
    assert grouped.groups[-1].phrase.end == raw.groups[-1].phrase.end
    assert {c.symptom_code for g in grouped.groups for c in g.candidates} == {
        c.symptom_code for g in raw.groups for c in g.candidates}


def test_pair_limit_preserves_grouping_of_original_36_development_cases():
    folder = Path(__file__).parent / "data"
    cases = [json.loads(line) for name in ("extraction_retrieval_dev_v1.jsonl",
                                         "extraction_selection_extra_v1.jsonl")
             for line in (folder / name).read_text(encoding="utf-8").splitlines() if line]
    assert len(cases) == 36
    # Chính sách ghép chỉ phụ thuộc span/ngữ cảnh, không phụ thuộc điểm/mã tìm được.
    for case in cases:
        raw = plan(case["clinical_note"])
        assert group_for_selection(raw) == group_for_selection(raw, pair_only=False), case["id"]
