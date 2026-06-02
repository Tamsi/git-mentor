"""LLM provider interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel


class ProviderStatus(BaseModel):
    ok: bool
    provider: str
    model: str
    message: str


class CompletionResult(BaseModel):
    content: str
    provider: str
    model: str
    raw: dict[str, Any] | None = None


class LLMProvider(ABC):
    id: str

    @abstractmethod
    async def complete(self, prompt: str, *, system: str | None = None) -> CompletionResult: ...

    @abstractmethod
    async def health_check(self) -> ProviderStatus: ...
