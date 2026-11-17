"""Kiểm định bộ lời kể phát triển giọng bệnh nhân cho nhóm trọng tâm (30 ca)."""

import json
import re
from pathlib import Path
from time import monotonic

import yaml

from app.ai.extraction.candidate_index import CandidateIndexCache
from app.ai.extraction.phrase_retrieval import retrieve_phrases
from app.ai.extraction.phrase_splitter import split_phrases
from app.ai.pipeline.node1_red_flag_gate import run_node1
from tests.unit.ai.fakes import FakeKnowledgeReader
from tests.unit.ai.manual_phrase_retrieval_probe import measure_mentions

REPO_ROOT = Path(__file__).resolve().parents[4]
DEV_DATASET = Path(__file__).parent / "data" / "focus_patient_voice_dev_v1.jsonl"
SYMPTOM_CATALOG = REPO_ROOT / "knowledge" / "symptoms" / "symptom_catalog.md"
FROZEN_TESTSET = REPO_ROOT / "evaluation" / "testset" / "symptom_extraction_testset.jsonl"

PURE_EXAM_CODES = frozenset(
    {
        "adenoid_facies_mouth_breathing",
        "ankylosing_spondylitis_schober_chest",
        "asthma_reversible_airflow_limitation",
        "conductive_hearing_loss",
        "decreased_breath_sounds_hyperresonance",
        "fixed_postbronchodilator_fev1_fvc_under_70",
        "glottic_closure_mucosal_wave_deficit",
        "granular_hypertrophic_pharyngitis",
        "middle_meatus_mucopurulent_discharge",
        "peak_expiratory_flow_variability",
        "pulmonary_crackles_rales_consolidation",
        "spontaneous_nystagmus_vestibular",
        "turbinate_hypertrophy_pallor",
        "tympanic_marginal_attic_perforation",
        "tympanic_membrane_lesion",
        "tympanic_retraction_pocket",
    }
)


def _load_cases() -> list[dict]:
    return [json.loads(line) for line in DEV_DATASET.read_text(encoding="utf-8").splitlines() if line.strip()]


def _load_catalog_symptoms() -> list[dict]:
    frontmatter = SYMPTOM_CATALOG.read_text(encoding="utf-8").split("---")[1]
    meta = yaml.safe_load(frontmatter)
    return [item for item in meta["symptoms"] if item.get("status", "Active") == "Active"]


def test_focus_patient_voice_dev_schema_and_coverage():
    cases = _load_cases()
    assert len(cases) == 30
    ids = [case["id"] for case in cases]
    assert ids == [f"fdev-{index:02d}" for index in range(1, 31)]
    assert len(set(ids)) == 30

    groups = [case["disease_group"] for case in cases]
    assert set(groups) == {"infectious", "ent", "respiratory", "musculoskeletal"}
    assert sum(group == "musculoskeletal" for group in groups) == 15
    assert sum(group != "musculoskeletal" for group in groups) == 15

    for case in cases:
        assert isinstance(case["age_years"], int) and case["age_years"] > 0
        assert isinstance(case["target_condition"], str) and case["target_condition"]
        assert isinstance(case["clinical_note"], str) and case["clinical_note"].strip()
        assert case["expected_symptoms"]
        assert set(case["expected_symptoms"].values()) <= {"PRESENT", "ABSENT", "UNKNOWN"}
        assert {mention["code"] for mention in case["expected_mentions"]} == set(case["expected_symptoms"])
        for mention in case["expected_mentions"]:
            assert mention["text"] in case["clinical_note"]


def test_focus_patient_voice_dev_uses_active_reported_codes_and_stays_separate_from_frozen():
    cases = _load_cases()
    active_codes = {item["symptom_code"] for item in _load_catalog_symptoms()}
    frozen_notes = {
        json.loads(line)["clinical_note"].strip().casefold()
        for line in FROZEN_TESTSET.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }

    for case in cases:
        codes = set(case["expected_symptoms"])
        assert codes <= active_codes, f"{case['id']}: inactive symptom codes {codes - active_codes}"
        assert not (codes & PURE_EXAM_CODES), f"{case['id']}: pure exam codes {codes & PURE_EXAM_CODES}"
        assert case["clinical_note"].strip().casefold() not in frozen_notes


def test_focus_patient_voice_dev_splits_and_retrieves_cleanly():
    cases = _load_cases()
    reader = FakeKnowledgeReader(
        release={"release_id": "kb-2026-11-catalog", "epoch": 1},
        symptoms=_load_catalog_symptoms(),
    )
    cache = CandidateIndexCache()

    for case in cases:
        gate = run_node1({"input_features": {"age_years": case["age_years"], "symptoms": {}}}, reader)
        assert gate["is_red_flag"] is False
        assert gate["ai_status"] != "Skipped"

        phrases = split_phrases(case["clinical_note"])
        assert phrases
        for word in re.finditer(r"\w+", case["clinical_note"]):
            assert any(phrase.start <= word.start() and phrase.end >= word.end() for phrase in phrases)

        plan = retrieve_phrases(
            case["clinical_note"],
            reader,
            cache,
            identifiers=[],
            per_phrase_limit=4,
            deadline=monotonic() + 10,
        )
        ranks, _ = measure_mentions(plan, case["expected_mentions"])
        assert len(ranks) == len(case["expected_mentions"])
