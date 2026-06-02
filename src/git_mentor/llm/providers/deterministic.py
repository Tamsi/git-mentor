"""Deterministic fallback when no LLM is available."""

from __future__ import annotations

from git_mentor.core.config import LLMConfig
from git_mentor.llm.providers.base import CompletionResult, LLMProvider, ProviderStatus


class DeterministicProvider(LLMProvider):
    id = "deterministic"

    def __init__(self, config: LLMConfig | None = None) -> None:
        self.config = config

    async def complete(self, prompt: str, *, system: str | None = None) -> CompletionResult:
        return CompletionResult(
            content="",
            provider=self.id,
            model="rules-engine",
            raw={"prompt_chars": len(prompt), "system": system},
        )

    async def health_check(self) -> ProviderStatus:
        return ProviderStatus(
            ok=True,
            provider=self.id,
            model="rules-engine",
            message="Deterministic mode always available",
        )
