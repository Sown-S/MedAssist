"""AI-23: không mất span, không trộn snapshot, không suy trạng thái từ điểm tìm kiếm."""

from dataclasses import FrozenInstanceError, replace
from copy import deepcopy
import re
from time import monotonic

import pytest

from app.ai.extraction.candidate_index import CandidateIndexCache
from app.ai.extraction.phrase_splitter import IncompleteSegmentation, split_phrases
from app.ai.extraction import phrase_retrieval
from app.ai.extraction.phrase_retrieval import RetrievalDeadlineExceeded, retrieve_phrases
from tests.unit.ai.fakes import FakeKnowledgeReader
from tests.unit.ai.manual_phrase_retrieval_probe import load_cases, measure_mentions


def reader(rows=None, *, epoch=1):
    return FakeKnowledgeReader(release={"release_id": "release-a", "epoch": epoch}, symptoms=rows or [
        {"symptom_code": "cough_dry", "symptom_name": "Ho khan hoặc ho từng cơn"},
        {"symptom_code": "wheezing", "symptom_name": "Thở khò khè"},
        {"symptom_code": "confusion", "symptom_name": "Lơ mơ, li bì, lú lẫn"},
        {"symptom_code": "watery_diarrhea", "symptom_name": "Đi ngoài phân lỏng như nước"},
    ])


@pytest.mark.parametrize("text", [
    "Không ho khan và khó thở.", "Không ho khan nhưng thở khò khè; chưa rõ đau đầu.",
    "Ho khan, khó thở\nKhò khè!", "Nhiệt độ 38.5 và 38,7; ho khan.",
    "Ho\u0300 khan, kho\u0301 tho\u031b.",
    " ", "...!?", "và ho khan và khó thở", "ho " * 90 + "khò khè",
])
def test_spans_preserve_every_word_and_context(text):
    groups = split_phrases(text)
    for phrase in groups:
        assert phrase.text == text[phrase.start:phrase.end]
        assert phrase.context == text[phrase.context_start:phrase.context_end]
        assert phrase.context_start <= phrase.start < phrase.end <= phrase.context_end
        assert not hasattr(phrase, "status")
    for word in re.finditer(r"\w+", text):
        assert any(phrase.start <= word.start() and phrase.end >= word.end() for phrase in groups)
    assert len({phrase.phrase_id for phrase in groups}) == len(groups)


def test_shared_negation_stays_in_context_and_decimal_is_not_split():
    text = "Không ho khan và khó thở ở nhiệt độ 38.5 hoặc 38,7."
    groups = split_phrases(text)
    assert len(groups) == 2
    assert groups[1].text.startswith("và khó thở")
    assert groups[1].context == text[:-1]


def test_long_clause_windows_overlap_and_keep_tail():
    text = " ".join(f"từ{i}" for i in range(70)) + " đau đầu"
    groups = split_phrases(text, window_words=12, overlap_words=4)
    assert groups[-1].text.endswith("đau đầu")
    assert all(left.end > right.start for left, right in zip(groups, groups[1:]))


@pytest.mark.parametrize("text,kwargs", [
    ("x" * 12001, {}), ("ho;" * 65, {}), ("ho khan", {"max_phrases": 1, "window_words": 1, "overlap_words": 0}),
])
def test_limits_raise_instead_of_returning_partial(text, kwargs):
    with pytest.raises(IncompleteSegmentation):
        split_phrases(text, **kwargs)


@pytest.mark.parametrize("kwargs", [{"max_chars": True}, {"max_phrases": 0},
                                    {"window_words": 3, "overlap_words": 3}, {"overlap_words": -1}])
def test_invalid_segmentation_limits(kwargs):
    with pytest.raises(ValueError):
        split_phrases("ho", **kwargs)


@pytest.mark.parametrize("query,code", [("Ho khan", "cough_dry"), ("khong tho kho khe", "wheezing"),
                                       ("thở khò khe", "wheezing"), ("lú lẫn", "confusion"),
                                       ("Đi ngoài phân lỏng như nước", "watery_diarrhea")])
def test_search_finds_accented_unaccented_typo_and_rule_only_codes(query, code):
    index = CandidateIndexCache().get(reader())
    assert index.search(query, limit=2)[0].symptom_code == code
    # Reader không có bệnh/quan hệ, mã chỉ dùng luật vẫn được lập chỉ mục.
    assert len(index.documents) == 4


def test_index_keeps_full_name_and_does_not_accept_inactive_codes():
    source = reader([
        {"symptom_code": "active", "symptom_name": "Tên rất dài; nhiều điều kiện, giữ nguyên"},
        {"symptom_code": "retired", "symptom_name": "Ho khan", "status": "Retired"},
    ])
    index = CandidateIndexCache().get(source)
    assert [(doc.code, doc.name) for doc in index.documents] == [
        ("active", "Tên rất dài; nhiều điều kiện, giữ nguyên")]


def test_search_is_deterministic_and_does_not_promote_negation_to_a_state():
    rows = [{"symptom_code": code, "symptom_name": "Ho khan"} for code in ("bbb", "aaa")]
    first = CandidateIndexCache().get(reader(rows)).search("Không ho khan", limit=2)
    second = CandidateIndexCache().get(reader(list(reversed(rows)))).search("Chưa rõ ho khan", limit=2)
    assert [row.symptom_code for row in first] == ["aaa", "bbb"]
    assert first == second
    assert not hasattr(first[0], "status")
    assert not hasattr(first[0], "confidence")


def test_cache_reuses_index_but_tracks_epoch_and_catalogue_contents():
    cache = CandidateIndexCache(max_entries=1)
    source = reader()
    first = cache.get(source)
    assert cache.get(source) is first
    source._release["epoch"] = 2
    second = cache.get(source)
    assert second is not first
    source._symptoms[0]["symptom_name"] = "Tên mới của ho khan"
    third = cache.get(source)
    assert third.snapshot_key != second.snapshot_key
    assert third.catalogue_sha256 != second.catalogue_sha256
    # Index đang được job cũ giữ vẫn dùng được sau khi LRU đã bỏ nó.
    assert first.search("ho khan", limit=1)[0].symptom_name == "Ho khan hoặc ho từng cơn"
    with pytest.raises(FrozenInstanceError):
        first.snapshot_key = "changed"
    with pytest.raises(TypeError):
        first.postings["new"] = ()


def test_index_is_independent_of_mutable_reader_data():
    source = reader()
    before = deepcopy(source._symptoms)
    index = CandidateIndexCache().get(source)
    source._symptoms.clear()
    assert len(index.documents) == len(before)


def test_changed_release_during_read_is_rejected():
    class ChangingReader(FakeKnowledgeReader):
        def active_symptoms(self):
            self._release["epoch"] += 1
            return super().active_symptoms()
    source = ChangingReader(release={"epoch": 1}, symptoms=[{"symptom_code": "ho", "symptom_name": "Ho"}])
    with pytest.raises(ValueError, match="snapshot changed"):
        CandidateIndexCache().get(source)


def test_catalogue_uses_existing_code_validator_and_hides_invalid_input():
    marker = "PRIVATE_BAD_CODE!"
    with pytest.raises(ValueError) as caught:
        CandidateIndexCache().get(reader([{"symptom_code": marker, "symptom_name": "Ho"}]))
    assert marker not in str(caught.value)


def test_empty_and_unrelated_query_do_not_pad_candidates():
    index = CandidateIndexCache().get(reader())
    assert index.search("", limit=8) == ()
    assert index.search("không chưa rõ", limit=8) == ()
    assert index.search("zzzzzz", limit=8) == ()


def test_retrieval_redacts_before_splitting_and_does_not_log_text_in_repr():
    source = reader()
    plan = retrieve_phrases(
        "Họ tên: PRIVATE_NAME; không ho khan và thở khò khè.", source, CandidateIndexCache(),
        identifiers=["PRIVATE_NAME"], per_phrase_limit=2, deadline=monotonic() + 5,
    )
    assert "PRIVATE_NAME" not in plan.masked_text
    assert "[REDACTED]" in plan.masked_text
    assert "khò khè" not in repr(plan)
    assert all("PRIVATE_NAME" not in group.phrase.context for group in plan.groups)
    assert any("cough_dry" in {row.symptom_code for row in group.candidates} for group in plan.groups)


def test_per_phrase_retrieval_keeps_multiple_specialties():
    plan = retrieve_phrases("Ho khan; đi ngoài phân lỏng như nước.", reader(), CandidateIndexCache(),
                            identifiers=[], per_phrase_limit=1, deadline=monotonic() + 5)
    assert [group.candidates[0].symptom_code for group in plan.groups] == ["cough_dry", "watery_diarrhea"]


def test_deadline_includes_index_build_and_refuses_partial_groups(monkeypatch):
    ticks = iter([0, 0, 0, 0, 10])
    monkeypatch.setattr(phrase_retrieval, "monotonic", lambda: next(ticks))
    with pytest.raises(RetrievalDeadlineExceeded):
        retrieve_phrases("Ho khan; khò khè", reader(), CandidateIndexCache(),
                         identifiers=[], per_phrase_limit=2, deadline=5)


def test_expired_deadline_does_not_read_knowledge():
    class NoReader:
        def active_release(self):
            pytest.fail("Expired job must not read knowledge")
    with pytest.raises(RetrievalDeadlineExceeded):
        retrieve_phrases("Ho", NoReader(), CandidateIndexCache(),
                         identifiers=[], per_phrase_limit=2, deadline=monotonic() - 1)


def test_development_mentions_include_missing_spans_in_denominator():
    plan = retrieve_phrases("Ho khan; đi ngoài phân lỏng như nước.", reader(), CandidateIndexCache(),
                            identifiers=[], per_phrase_limit=1, deadline=monotonic() + 5)
    mentions = [{"text": "Ho khan", "code": "cough_dry"},
                {"text": "đi ngoài phân lỏng như nước", "code": "watery_diarrhea"}]
    assert measure_mentions(plan, mentions) == ([1, 1], [])
    missing_tail = replace(plan, groups=plan.groups[:1])
    assert measure_mentions(missing_tail, mentions) == ([1, None], ["watery_diarrhea"])
    # Có mã đúng ở nhóm khác không được tính là hit của mention đang xét.
    swapped = replace(plan, groups=(
        replace(plan.groups[0], candidates=plan.groups[1].candidates),
        replace(plan.groups[1], candidates=plan.groups[0].candidates),
    ))
    assert measure_mentions(swapped, mentions) == ([None, None], ["cough_dry", "watery_diarrhea"])


def test_development_dataset_is_separate_and_well_formed():
    cases = load_cases()
    assert len(cases) == 26
    assert all(case["id"].startswith("dev-r") for case in cases)
    assert all(set(case["expected_symptoms"].values()) <= {"PRESENT", "ABSENT", "UNKNOWN"} for case in cases)
