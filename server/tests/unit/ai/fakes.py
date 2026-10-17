"""In-memory collaborators shared by AI unit tests."""

from collections.abc import Mapping, Sequence
from copy import deepcopy
from typing import Any


class FakeKnowledgeReader:
    """Simulate Active graph/catalogue reads, including Node 2's nested rows.

    Omitted status means Active in synthetic fixtures; explicit Draft,
    PendingApproval and Retired graph/catalogue rows are excluded by the reader.
    """

    def __init__(
        self,
        *,
        release: Mapping[str, Any] | None = None,
        triage_rules: Sequence[Mapping[str, Any]] = (),
        conditions: Sequence[Mapping[str, Any]] = (),
        symptoms: Sequence[Mapping[str, Any]] = (),
    ) -> None:
        self._release = dict(release or {"release_id": "test-release"})
        self._triage_rules = [dict(item) for item in triage_rules]
        self._conditions = [dict(item) for item in conditions]
        self._symptoms = [dict(item) for item in symptoms]

    def active_release(self) -> dict[str, Any]:
        return deepcopy(self._release)

    def active_triage_rules(self) -> list[dict[str, Any]]:
        return deepcopy(self._triage_rules)

    def active_conditions(self) -> list[dict[str, Any]]:
        conditions = self._active(self._conditions)
        for condition in conditions:
            for key in ("symptoms", "guidelines"):
                if key in condition:
                    condition[key] = self._active(condition[key])
        return conditions

    def active_symptoms(self) -> list[dict[str, Any]]:
        return self._active(self._symptoms)

    @staticmethod
    def _active(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
        return deepcopy([dict(row) for row in rows if row.get("status", "Active") == "Active"])


class FakeLLMClient:
    def __init__(
        self,
        response: Mapping[str, Any] | None = None,
        *,
        error: Exception | None = None,
    ) -> None:
        self.response = dict(response or {})
        self.error = error
        self.calls: list[dict[str, Any]] = []

    async def generate_json(
        self,
        *,
        prompt: str,
        schema: Mapping[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        self.calls.append(
            {"prompt": prompt, "schema": dict(schema), "timeout_seconds": timeout_seconds}
        )
        if self.error is not None:
            raise self.error
        return deepcopy(self.response)
