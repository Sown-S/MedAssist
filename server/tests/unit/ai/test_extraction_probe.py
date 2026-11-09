"""Bộ đo không được ghi nhận fallback rỗng là một ca model trả đúng."""

import pytest

from tests.unit.ai.manual_extraction_probe import compare_result, valid_response


def test_empty_fallback_is_not_success_for_empty_expected_case():
    assert compare_result({}, {}, completed=False)["exact_match"] is False


def test_successful_empty_model_response_can_match_empty_case():
    assert compare_result({}, {}, completed=True)["exact_match"] is True


def test_wrong_negation_missing_and_unexpected_are_reported():
    result = compare_result(
        {"cough_dry": "PRESENT", "extra": "PRESENT"},
        {"cough_dry": "ABSENT", "wheezing_bronchospasm": "UNKNOWN"},
        completed=True,
    )
    assert result == {"exact_match": False,
                      "missing_or_wrong": ["cough_dry", "wheezing_bronchospasm"],
                      "unexpected": ["extra"]}


@pytest.mark.parametrize("response", [
    {}, {"symptoms": [], "extra": True},
    {"symptoms": [{"symptom_code": "unknown", "status": "PRESENT"}]},
    {"symptoms": [{"symptom_code": "cough_dry", "status": "wrong"}]},
    {"symptoms": [{"symptom_code": "cough_dry", "status": "PRESENT"},
                  {"symptom_code": "cough_dry", "status": "ABSENT"}]},
])
def test_malformed_or_invented_output_is_not_successful_empty_result(response):
    assert valid_response(response, {"cough_dry"}) is False


def test_valid_empty_response_is_distinguished_from_invalid_fallback():
    assert valid_response({"symptoms": []}, {"cough_dry"}) is True
