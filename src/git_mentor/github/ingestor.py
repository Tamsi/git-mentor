"""Fetch and normalize GitHub data for analysis."""

from __future__ import annotations

from typing import Any

from git_mentor.core.config import GitMentorConfig
from git_mentor.github.client import MANIFEST_FILES, GitHubClient


class GitHubIngestor:
    def __init__(self, config: GitMentorConfig) -> None:
        self.client = GitHubClient(config)

    def fetch_profile_data(self, username: str, *, repo_limit: int = 30) -> dict[str, Any]:
        user = self.client.get_user(username)
        repos = self.client.get_user_repos(username, limit=repo_limit)
        enriched_repos: list[dict[str, Any]] = []

        for repo in repos:
            owner = repo["owner"]["login"]
            name = repo["name"]
            languages = self.client.get_repo_languages(owner, name)
            root_files = self.client.get_repo_root_files(owner, name)
            dependency_markers: list[str] = []

            for manifest in MANIFEST_FILES:
                if manifest in root_files:
                    content = self.client.get_file_content(owner, name, manifest)
                    if content:
                        dependency_markers.append(content[:4000])

            enriched_repos.append(
                {
                    **repo,
                    "language_breakdown": languages,
                    "dependency_markers": dependency_markers,
                }
            )

        return {"user": user, "repos": enriched_repos}
