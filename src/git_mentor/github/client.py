"""GitHub API client with rate-limit awareness."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import httpx

from git_mentor.core.config import CACHE_DIR, GitMentorConfig

GITHUB_API = "https://api.github.com"
MANIFEST_FILES = (
    "package.json",
    "composer.json",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
    "Gemfile",
)


class GitHubClient:
    def __init__(self, config: GitMentorConfig) -> None:
        self.config = config
        self.token = config.github.token or self._token_from_gh_cli()

    def _token_from_gh_cli(self) -> str | None:
        if not self.config.github.use_gh_cli:
            return None
        try:
            result = subprocess.run(
                ["gh", "auth", "token"],
                capture_output=True,
                text=True,
                check=True,
            )
            return result.stdout.strip() or None
        except (FileNotFoundError, subprocess.CalledProcessError):
            return None

    def _headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _cache_path(self, key: str) -> Path:
        safe = key.replace("/", "_")
        return CACHE_DIR / f"{safe}.json"

    def _get_cached(self, key: str) -> Any | None:
        path = self._cache_path(key)
        if path.exists():
            return json.loads(path.read_text())
        return None

    def _set_cache(self, key: str, data: Any) -> None:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        self._cache_path(key).write_text(json.dumps(data, default=str))

    def get(self, path: str, *, cache: bool = True) -> Any:
        cache_key = f"GET_{path}"
        if cache:
            cached = self._get_cached(cache_key)
            if cached is not None:
                return cached

        with httpx.Client(timeout=30.0) as client:
            response = client.get(f"{GITHUB_API}{path}", headers=self._headers())
            response.raise_for_status()
            data = response.json()

        if cache:
            self._set_cache(cache_key, data)
        return data

    def get_user(self, username: str) -> dict[str, Any]:
        return self.get(f"/users/{username}")

    def get_user_repos(self, username: str, *, limit: int = 30) -> list[dict[str, Any]]:
        repos: list[dict[str, Any]] = []
        page = 1
        while len(repos) < limit:
            batch = self.get(
                f"/users/{username}/repos?sort=pushed&per_page=30&page={page}",
                cache=True,
            )
            if not batch:
                break
            repos.extend(batch)
            if len(batch) < 30:
                break
            page += 1
        return repos[:limit]

    def get_repo_languages(self, owner: str, repo: str) -> dict[str, int]:
        try:
            return self.get(f"/repos/{owner}/{repo}/languages")
        except httpx.HTTPError:
            return {}

    def get_repo_root_files(self, owner: str, repo: str) -> list[str]:
        try:
            contents = self.get(f"/repos/{owner}/{repo}/contents/")
            return [item["name"] for item in contents if item["type"] == "file"]
        except httpx.HTTPError:
            return []

    def get_file_content(self, owner: str, repo: str, path: str) -> str | None:
        try:
            payload = self.get(f"/repos/{owner}/{repo}/contents/{path}")
            if isinstance(payload, list):
                return None
            import base64

            content = payload.get("content")
            if not content:
                return None
            return base64.b64decode(content).decode("utf-8", errors="ignore")
        except httpx.HTTPError:
            return None
