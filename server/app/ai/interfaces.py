"""Stable dependency boundaries used by the AI pipeline.

The pipeline consumes plain mappings so it does not depend on SQLAlchemy models or
on the concrete knowledge-reader implementation owned by another module.
"""

from collections.abc import Mapping, Sequence
from typing import Any, Protocol, runtime_checkable

JsonObject = Mapping[str, Any]


@runtime_checkable
class KnowledgeReader(Protocol):
    """Read the Active knowledge release used by one assessment run."""

    def active_release(self) -> JsonObject:
        """Return metadata for the currently Active knowledge release."""
        ...

    def active_triage_rules(self) -> Sequence[JsonObject]:
        """Return Active red-flag and priority-floor rules."""
        ...

    def active_conditions(self) -> Sequence[JsonObject]:
        """Return Active conditions and their deterministic-scoring data."""
        ...

    def active_symptoms(self) -> Sequence[JsonObject]:
        """Return the Active symptom catalogue."""
        ...


@runtime_checkable
class LLMClient(Protocol):
    """Local structured-output LLM boundary used only by worker-side code."""

    async def generate_json(
        self,
        *,
        prompt: str,
        schema: Mapping[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        """Generate one JSON object conforming to ``schema`` or raise an error."""
        ...
