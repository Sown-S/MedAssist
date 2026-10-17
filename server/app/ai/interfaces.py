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
        """Return Active conditions with nested Active ``symptoms``/``guidelines``.

        Temporary Node 2 mapping: condition_code, name_vi, icd10_code; symptoms
        contain symptom_code, polarity, weight, is_key; guidelines contain
        excerpt_key and the excerpt/source fields. Reconcile with OKF and the
        concrete reader before production integration.
        """
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
        """Request schema-constrained JSON or raise a typed client error.

        Returned objects remain untrusted until Node 4 (or extraction's Active
        catalogue checks and nurse confirmation) validates them before use.
        """
        ...
