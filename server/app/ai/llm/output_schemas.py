"""Version 1 generation contracts, shared with future Node 4/FR12 validation.

These describe shape only. Do not replace validation.knowledge_validators or
Node 4's candidate/evidence/safety checks with these models. No generated
evidence, ICD codes or priority assignment is accepted from the LLM.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

OUTPUT_SCHEMA_VERSION = "1"


class _StrictOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class RankedCondition(_StrictOutput):
    condition_code: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=1, max_length=500)


class ReasoningOutput(_StrictOutput):
    # Node 2 supplies up to four candidates internally; Node 4/service limit
    # the displayed list to three and add the Reference Suggestion label.
    ranking: list[RankedCondition] = Field(max_length=4)
    raise_priority: bool = Field(description="Only suggest Routine -> HighPriority; never lower.")


class ExtractedSymptom(_StrictOutput):
    symptom_code: str = Field(min_length=1, max_length=128)
    status: Literal["PRESENT", "ABSENT", "UNKNOWN"]


class ExtractionOutput(_StrictOutput):
    # Extraction is tentative; AI-10 must check the Active catalogue and the
    # nurse must confirm it before any extracted feature enters assessment.
    symptoms: list[ExtractedSymptom]


def reasoning_json_schema() -> dict[str, Any]:
    """Return a fresh schema suitable for Ollama's format parameter."""
    return ReasoningOutput.model_json_schema()


def extraction_json_schema() -> dict[str, Any]:
    return ExtractionOutput.model_json_schema()
