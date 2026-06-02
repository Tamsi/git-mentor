"""Local configuration and paths."""

from __future__ import annotations

from pathlib import Path

import yaml
from platformdirs import user_config_dir, user_data_dir
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


APP_NAME = "git-mentor"
CONFIG_DIR = Path(user_config_dir(APP_NAME))
DATA_DIR = Path(user_data_dir(APP_NAME))
CONFIG_FILE = CONFIG_DIR / "config.yaml"
CACHE_DIR = DATA_DIR / "cache"
REPORTS_DIR = DATA_DIR / "reports"
DB_PATH = DATA_DIR / "git-mentor.db"


class LLMConfig(BaseModel):
    provider: str = "ollama"
    model: str = "qwen3:8b"
    base_url: str = "http://localhost:11434"
    api_key: str | None = None
    temperature: float = 0.2
    max_tokens: int = 4096


class GitHubConfig(BaseModel):
    token: str | None = None
    use_gh_cli: bool = True


class GitMentorConfig(BaseModel):
    llm: LLMConfig = Field(default_factory=LLMConfig)
    github: GitHubConfig = Field(default_factory=GitHubConfig)
    default_role: str = "ai-engineer"
    cache_ttl_hours: int = 24


class EnvSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GIT_MENTOR_", extra="ignore")

    github_token: str | None = None
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_base_url: str | None = None
    llm_api_key: str | None = None


def ensure_dirs() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def load_config() -> GitMentorConfig:
    ensure_dirs()
    config = GitMentorConfig()
    if CONFIG_FILE.exists():
        raw = yaml.safe_load(CONFIG_FILE.read_text()) or {}
        config = GitMentorConfig.model_validate(raw)

    env = EnvSettings()
    if env.github_token:
        config.github.token = env.github_token
    if env.llm_provider:
        config.llm.provider = env.llm_provider
    if env.llm_model:
        config.llm.model = env.llm_model
    if env.llm_base_url:
        config.llm.base_url = env.llm_base_url
    if env.llm_api_key:
        config.llm.api_key = env.llm_api_key
    return config


def save_config(config: GitMentorConfig) -> None:
    ensure_dirs()
    CONFIG_FILE.write_text(yaml.safe_dump(config.model_dump(), sort_keys=False))
