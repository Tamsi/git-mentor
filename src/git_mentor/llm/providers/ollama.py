"""Ollama provider (local or remote)."""

from __future__ import annotations

import httpx

from git_mentor.core.config import LLMConfig
from git_mentor.llm.providers.base import CompletionResult, LLMProvider, ProviderStatus


class OllamaProvider(LLMProvider):
    id = "ollama"

    def __init__(self, config: LLMConfig) -> None:
        self.config = config
        self.base_url = config.base_url.rstrip("/")

    async def complete(self, prompt: str, *, system: str | None = None) -> CompletionResult:
        payload: dict = {
            "model": self.config.model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": self.config.temperature},
        }
        if system:
            payload["system"] = system

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(f"{self.base_url}/api/generate", json=payload)
            response.raise_for_status()
            data = response.json()

        return CompletionResult(
            content=data.get("response", ""),
            provider=self.id,
            model=self.config.model,
            raw=data,
        )

    async def health_check(self) -> ProviderStatus:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
            return ProviderStatus(
                ok=True,
                provider=self.id,
                model=self.config.model,
                message="Ollama reachable",
            )
        except httpx.HTTPError as exc:
            return ProviderStatus(
                ok=False,
                provider=self.id,
                model=self.config.model,
                message=str(exc),
            )
