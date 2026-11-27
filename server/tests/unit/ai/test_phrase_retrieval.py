"""AI-23: không mất span, không trộn snapshot, không suy trạng thái từ điểm tìm kiếm."""

import re
from copy import deepcopy
from dataclasses import FrozenInstanceError, replace
from time import monotonic

import pytest

from app.ai.extraction import phrase_retrieval
from app.ai.extraction.candidate_index import CandidateIndexCache
from app.ai.extraction.phrase_retrieval import RetrievalDeadlineExceeded, retrieve_phrases
from app.ai.extraction.phrase_splitter import IncompleteSegmentation, split_phrases
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


def test_numbered_items_keep_the_number_with_the_sentence_and_original_offsets():
    text = "1. Ho khan, không khó thở.\n2. Nhiệt độ 38.5, không buồn nôn."
    groups = split_phrases(text)
    assert len(groups) == 4
    assert groups[0].text == "1. Ho khan"
    assert groups[2].text == "2. Nhiệt độ 38.5"
    for phrase in groups:
        assert phrase.text == text[phrase.start:phrase.end]
        assert phrase.context == text[phrase.context_start:phrase.context_end]
    assert groups[1].context == "1. Ho khan, không khó thở"
    assert groups[3].context == "2. Nhiệt độ 38.5, không buồn nôn"


def test_inline_numbers_and_decimal_temperature_still_split_normally():
    groups = split_phrases("Ho 2 ngày. Nhiệt độ 38.5.")
    assert len(groups) == 2
    assert groups[0].text == "Ho 2 ngày"
    assert groups[1].text == "Nhiệt độ 38.5"


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


def test_accented_minimal_pairs_and_clinical_words_do_not_collide_via_strip_accents():
    source = reader([
        {
            "symptom_code": "dermatophytosis_annular_active_border",
            "symptom_name": "Mảng đỏ hình tròn giới hạn rõ (Nấm sợi, nấm da)",
        },
        {
            "symptom_code": "melasma_symmetric_facial_hyperpigmentation",
            "symptom_name": "Dát tăng sắc tố màu nâu đối xứng ở gò má (Rám má, nám da)",
        },
        {
            "symptom_code": "urinary_retention",
            "symptom_name": "Bí tiểu",
        },
        {
            "symptom_code": "myalgia",
            "symptom_name": "Đau mỏi cơ",
        },
    ])
    index = CandidateIndexCache().get(source)
    nam_soi = index.search("bị nấm da", limit=2)
    nam_ma = index.search("bị nám da", limit=2)
    assert nam_soi[0].symptom_code == "dermatophytosis_annular_active_border"
    assert nam_ma[0].symptom_code == "melasma_symmetric_facial_hyperpigmentation"
    # Truy vấn không dấu vẫn tìm được cả hai ứng viên qua nhánh không dấu.
    unaccented = {row.symptom_code for row in index.search("bi nam da", limit=2)}
    assert unaccented == {
        "dermatophytosis_annular_active_border",
        "melasma_symmetric_facial_hyperpigmentation",
    }
    # Các từ y khoa trùng hình thức không dấu với từ chức năng ('bí'/'bị', 'cơ'/'có') không bị mất.
    assert index.search("bí tiểu", limit=1)[0].symptom_code == "urinary_retention"
    assert index.search("đau cơ", limit=1)[0].symptom_code == "myalgia"


def test_aliases_improve_retrieval_and_preserve_canonical_name():
    source = reader([
        {
            "symptom_code": "sciatica_lasegue_positive",
            "symptom_name": "Đau thần kinh tọa kèm dấu hiệu Lasègue dương tính",
            "aliases": [
                "đau lưng lan xuống chân",
                "đau dây thần kinh tọa",
                "đau lan từ mông xuống bắp chân",
            ],
            "detection": "both",
        },
        {
            "symptom_code": "low_back_pain",
            "symptom_name": "Đau thắt lưng đơn thuần",
            "aliases": [],
            "detection": "reported",
        },
    ])
    index = CandidateIndexCache().get(source)

    accented = index.search("đau lưng lan xuống chân", limit=2)
    assert accented[0].symptom_code == "sciatica_lasegue_positive"
    assert accented[0].symptom_name == "Đau thần kinh tọa kèm dấu hiệu Lasègue dương tính"
    assert "alias" in accented[0].match_sources

    unaccented = index.search("dau lung lan xuong chan", limit=2)
    assert unaccented[0].symptom_code == "sciatica_lasegue_positive"
    assert unaccented[0].symptom_name == "Đau thần kinh tọa kèm dấu hiệu Lasègue dương tính"
    assert "alias" in unaccented[0].match_sources

    canonical = index.search("dấu hiệu Lasègue dương tính", limit=2)
    assert canonical[0].symptom_code == "sciatica_lasegue_positive"
    assert "alias" not in canonical[0].match_sources

    multi_alias = index.search("đau dây thần kinh tọa, đau lưng lan xuống chân", limit=4)
    assert [row.symptom_code for row in multi_alias].count("sciatica_lasegue_positive") == 1


def test_many_aliases_do_not_dilute_length_normalization():
    source = reader([
        {
            "symptom_code": "target_sciatica",
            "symptom_name": "Hội chứng rễ thần kinh thắt lưng cùng mạn tính mức độ nặng",
            "aliases": [
                "đau lưng lan xuống chân",
                "tê buốt mặt sau đùi",
                "nhói dọc cẳng chân",
                "tê bì mu bàn chân",
                "đau âm ỉ vùng mông",
                "rối loạn cảm giác rễ thắt lưng",
                "khó cúi gập người",
                "đau tăng khi ho hắt hơi",
                "đau chói khi ngồi lâu",
                "căng tức dọc bắp chuối",
            ],
        },
        {
            "symptom_code": "distractor_back",
            "symptom_name": "Đau lưng",
            "aliases": [],
        },
    ])
    index = CandidateIndexCache().get(source)
    hits = index.search("đau lưng lan xuống chân", limit=2)
    assert hits[0].symptom_code == "target_sciatica"
    assert "alias" in hits[0].match_sources


def test_alias_accented_minimal_pairs_do_not_collide():
    source = reader([
        {
            "symptom_code": "tinea_lesion",
            "symptom_name": "Tổn thương dạng vòng bong vảy",
            "aliases": ["nấm da"],
        },
        {
            "symptom_code": "melasma_lesion",
            "symptom_name": "Tăng sắc tố gò má đối xứng",
            "aliases": ["nám da"],
        },
    ])
    index = CandidateIndexCache().get(source)
    assert index.search("bị nấm da", limit=2)[0].symptom_code == "tinea_lesion"
    assert index.search("bị nám da", limit=2)[0].symptom_code == "melasma_lesion"
    assert {row.symptom_code for row in index.search("bi nam da", limit=2)} == {
        "tinea_lesion",
        "melasma_lesion",
    }


def test_exam_detection_codes_are_excluded_from_extraction_index():
    source = reader([
        {"symptom_code": "sym_reported", "symptom_name": "Ho khan", "detection": "reported"},
        {"symptom_code": "sym_both", "symptom_name": "Sốt nhẹ", "detection": "both"},
        {"symptom_code": "sym_default", "symptom_name": "Mệt mỏi"},
        {"symptom_code": "sym_none", "symptom_name": "Đau đầu", "detection": None},
        {
            "symptom_code": "sym_exam",
            "symptom_name": "Nghe kém dẫn truyền khi khám Rinne âm tính",
            "aliases": ["ho khan", "khám tai thấy bất thường"],
            "detection": "exam",
        },
    ])
    index = CandidateIndexCache().get(source)
    assert {doc.code for doc in index.documents} == {
        "sym_reported",
        "sym_both",
        "sym_default",
        "sym_none",
    }
    assert index.search("Nghe kém dẫn truyền khi khám Rinne âm tính", limit=5) == () or all(
        row.symptom_code != "sym_exam" for row in index.search("Nghe kém dẫn truyền khi khám Rinne âm tính", limit=5)
    )
    assert all(row.symptom_code != "sym_exam" for row in index.search("khám tai thấy bất thường", limit=5))
    assert index.search("Ho khan", limit=4)[0].symptom_code == "sym_reported"


def test_all_exam_catalogue_returns_empty_index_safely():
    source = reader([
        {"symptom_code": "exam_only_a", "symptom_name": "Dấu hiệu khám A", "detection": "exam"},
        {"symptom_code": "exam_only_b", "symptom_name": "Dấu hiệu khám B", "detection": "exam"},
    ])
    index = CandidateIndexCache().get(source)
    assert index.documents == ()
    assert index.entries == ()
    assert index.search("Dấu hiệu khám A", limit=4) == ()


def test_cache_invalidates_when_aliases_or_detection_change():
    cache = CandidateIndexCache(max_entries=2)
    base_rows = [
        {
            "symptom_code": "dyspnea_on_exertion",
            "symptom_name": "Khó thở khi gắng sức",
            "aliases": ["hụt hơi", "thở dốc"],
            "detection": "reported",
        },
    ]
    source = reader(deepcopy(base_rows))
    first = cache.get(source)

    # Đảo thứ tự aliases phải giữ nguyên cache key và catalogue_sha256.
    reordered = reader([
        {
            "symptom_code": "dyspnea_on_exertion",
            "symptom_name": "Khó thở khi gắng sức",
            "aliases": ["thở dốc", "hụt hơi"],
            "detection": "reported",
        },
    ])
    same = cache.get(reordered)
    assert same is first
    assert same.snapshot_key == first.snapshot_key
    assert same.catalogue_sha256 == first.catalogue_sha256

    # Đổi aliases khi giữ nguyên epoch phải tạo chỉ mục mới.
    source._symptoms[0]["aliases"] = ["hụt hơi khi leo cầu thang"]
    alias_changed = cache.get(source)
    assert alias_changed is not first
    assert alias_changed.snapshot_key != first.snapshot_key
    assert alias_changed.catalogue_sha256 != first.catalogue_sha256

    # Đổi detection khi giữ nguyên epoch cũng phải làm mới chỉ mục.
    source._symptoms[0]["detection"] = "exam"
    detection_changed = cache.get(source)
    assert detection_changed is not alias_changed
    assert detection_changed.snapshot_key != alias_changed.snapshot_key
    assert detection_changed.catalogue_sha256 != alias_changed.catalogue_sha256
    assert detection_changed.documents == ()


@pytest.mark.parametrize(
    "bad_row",
    [
        {"symptom_code": "ho", "symptom_name": "Ho", "detection": "PRIVATE_BAD_VALUE"},
        {"symptom_code": "ho", "symptom_name": "Ho", "detection": 123},
        {"symptom_code": "ho", "symptom_name": "Ho", "applicable_sex": "PRIVATE_BAD_VALUE"},
        {"symptom_code": "ho", "symptom_name": "Ho", "applicable_sex": 123},
        {"symptom_code": "ho", "symptom_name": "Ho", "aliases": "PRIVATE_BAD_VALUE"},
        {"symptom_code": "ho", "symptom_name": "Ho", "aliases": ["PRIVATE_BAD_VALUE", ""]},
        {"symptom_code": "ho", "symptom_name": "Ho", "aliases": ["PRIVATE_BAD_VALUE", "   "]},
        {"symptom_code": "ho", "symptom_name": "Ho", "aliases": [123]},
    ],
)
def test_invalid_aliases_or_detection_in_catalogue_fail_closed_and_hide_marker(bad_row):
    with pytest.raises(ValueError) as caught:
        CandidateIndexCache().get(reader([bad_row]))
    assert "Invalid Active symptom catalogue." in str(caught.value)
    assert "PRIVATE_BAD_VALUE" not in str(caught.value)


@pytest.mark.parametrize(
    "sex,expected",
    [
        ("Male", {"sym_any", "sym_male", "sym_missing", "sym_none"}),
        ("Female", {"sym_any", "sym_female", "sym_missing", "sym_none"}),
        ("Other", {"sym_any", "sym_female", "sym_male", "sym_missing", "sym_none"}),
        (None, {"sym_any", "sym_female", "sym_male", "sym_missing", "sym_none"}),
    ],
)
def test_search_filters_applicable_sex_matching_node2_and_preserves_limit_slots(sex, expected):
    rows = [
        {"symptom_code": "sym_any", "symptom_name": "Đau vùng chậu", "applicable_sex": "Any"},
        {
            "symptom_code": "sym_female",
            "symptom_name": "Đau vùng chậu hạ vị kèm khí hư",
            "applicable_sex": "Female",
        },
        {"symptom_code": "sym_male", "symptom_name": "Đau vùng chậu hạ vị", "applicable_sex": "Male"},
        {"symptom_code": "sym_missing", "symptom_name": "Đau vùng chậu mạn"},
        {"symptom_code": "sym_none", "symptom_name": "Đau vùng chậu nhẹ", "applicable_sex": None},
    ]
    cache = CandidateIndexCache()
    source = reader(rows)
    index = cache.get(source)
    got = {c.symptom_code for c in index.search("Đau vùng chậu hạ vị", limit=10, sex=sex)}
    assert got == expected

    # Mã Female khớp cao nhất không được chiếm suất Top-1 của bệnh nhân Male.
    top_for_male = index.search("Đau vùng chậu hạ vị kèm khí hư", limit=1, sex="Male")
    assert len(top_for_male) == 1
    assert top_for_male[0].symptom_code != "sym_female"

    # Retrieve theo từng giới tính vẫn dùng chung một CandidateIndex trong cache.
    plan_male = retrieve_phrases(
        "Đau vùng chậu hạ vị kèm khí hư.", source, cache, identifiers=(), per_phrase_limit=10, deadline=monotonic() + 5, sex="Male"
    )
    plan_female = retrieve_phrases(
        "Đau vùng chậu hạ vị kèm khí hư.", source, cache, identifiers=(), per_phrase_limit=10, deadline=monotonic() + 5, sex="Female"
    )
    assert cache.get(source) is index
    assert "sym_female" not in {c.symptom_code for c in plan_male.groups[0].candidates}
    assert "sym_female" in {c.symptom_code for c in plan_female.groups[0].candidates}


def test_cache_invalidates_when_applicable_sex_changes():
    cache = CandidateIndexCache(max_entries=2)
    source = reader([{"symptom_code": "pelvic_pain", "symptom_name": "Đau vùng chậu", "applicable_sex": "Any"}])
    first = cache.get(source)
    source._symptoms[0]["applicable_sex"] = "Female"
    updated = cache.get(source)
    assert updated is not first
    assert updated.snapshot_key != first.snapshot_key
    assert updated.catalogue_sha256 != first.catalogue_sha256
