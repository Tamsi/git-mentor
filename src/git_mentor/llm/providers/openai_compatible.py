"""OpenAI-compatible provider (OpenAI, OpenRouter, remote endpoints)."""

from __future__ import annotations

import httpx

from git_mentor.core.config import LLMConfig
from git_mentor.llm.providers.base import CompletionResult, LLMProvider, ProviderStatus

DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
}


class OpenAICompatibleProvider(LLMProvider):
    id = "openai-compatible"

    def __init__(self, config: LLMConfig, provider_id: str) -> None:
        self.config = config
        self.provider_id = provider_id
        self.base_url = config.base_url.rstrip("/") or DEFAULT_BASE_URLS.get(
            provider_id, DEFAULT_BASE_URLS["openai"]
        )

    async def complete(self, prompt: str, *, system: str | None = None) -> CompletionResult:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"

        payload = {
            "model": self.config.model,
            "messages": messages,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        content = data["choices"][0]["message"]["content"]
        return CompletionResult(
            content=content,
            provider=self.provider_id,
            model=self.config.model,
            raw=data,
        )

    async def health_check(self) -> ProviderStatus:
        if not self.config.api_key and self.provider_id in {"openai", "openrouter", "anthropic"}:
            return ProviderStatus(
                ok=False,
                provider=self.provider_id,
                model=self.config.model,
                message="API key missing",
            )
        return ProviderStatus(
            ok=True,
            provider=self.provider_id,
            model=self.config.model,
            message="Configured",
        )
