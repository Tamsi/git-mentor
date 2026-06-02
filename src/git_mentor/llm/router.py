"""Route requests to configured LLM providers."""

from __future__ import annotations

from git_mentor.core.config import GitMentorConfig, LLMConfig
from git_mentor.llm.providers.base import CompletionResult, LLMProvider, ProviderStatus
from git_mentor.llm.providers.deterministic import DeterministicProvider
from git_mentor.llm.providers.ollama import OllamaProvider
from git_mentor.llm.providers.openai_compatible import OpenAICompatibleProvider

SUPPORTED_PROVIDERS = {
    "ollama",
    "openai",
    "anthropic",
    "openrouter",
    "gemini",
    "deterministic",
}


class LLMRouter:
    def __init__(self, config: GitMentorConfig) -> None:
        self.config = config

    def get_provider(self, override: LLMConfig | None = None) -> LLMProvider:
        llm = override or self.config.llm
        provider = llm.provider.lower()

        if provider == "ollama":
            return OllamaProvider(llm)
        if provider in {"openai", "openrouter", "anthropic", "gemini"}:
            return OpenAICompatibleProvider(llm, provider)
        if provider == "deterministic":
            return DeterministicProvider(llm)
        raise ValueError(
            f"Unsupported provider '{provider}'. Supported: {', '.join(sorted(SUPPORTED_PROVIDERS))}"
        )

    async def complete(self, prompt: str, *, system: str | None = None) -> CompletionResult:
        provider = self.get_provider()
        result = await provider.complete(prompt, system=system)
        if provider.id != "deterministic" and not result.content.strip():
            fallback = DeterministicProvider()
            return await fallback.complete(prompt, system=system)
        return result

    async def health_check(self) -> ProviderStatus:
        return await self.get_provider().health_check()
