"""Deterministic skill signal extraction from GitHub data."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

from git_mentor.core.schemas import (
    Confidence,
    DeveloperProfile,
    DomainClaim,
    Evidence,
    EvidenceType,
    SkillClaim,
    SkillLevel,
)

LANGUAGE_ALIASES: dict[str, str] = {
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "python": "Python",
    "php": "PHP",
    "java": "Java",
    "go": "Go",
    "rust": "Rust",
    "ruby": "Ruby",
    "c#": "C#",
    "c++": "C++",
    "shell": "Shell",
    "dockerfile": "Docker",
}

DEPENDENCY_SIGNALS: dict[str, list[str]] = {
    "Symfony": ["symfony/", "symfony"],
    "React": ["react", "react-dom", "@types/react"],
    "LangGraph": ["langgraph"],
    "FastAPI": ["fastapi"],
    "Laravel": ["laravel/framework"],
    "Next.js": ["next"],
    "PyTorch": ["torch"],
    "Transformers": ["transformers"],
    "Ollama": ["ollama"],
}

DOMAIN_RULES: list[tuple[str, list[str]]] = [
    ("Backend Architecture", ["php", "python", "go", "java", "rust", "api", "backend"]),
    ("Frontend", ["typescript", "javascript", "react", "vue", "css", "frontend"]),
    ("AI Engineering", ["llm", "rag", "langchain", "transformers", "pytorch", "ai", "ml"]),
    ("Cloud Infrastructure", ["docker", "kubernetes", "terraform", "aws", "devops"]),
    ("Open Source", ["oss", "maintainer", "contributor"]),
    ("API Design", ["openapi", "graphql", "rest", "grpc", "api"]),
]


def _level_from_score(score: float) -> SkillLevel:
    if score >= 8.5:
        return SkillLevel.EXPERT
    if score >= 7.0:
        return SkillLevel.ADVANCED
    if score >= 5.0:
        return SkillLevel.INTERMEDIATE
    if score >= 3.0:
        return SkillLevel.EMERGING
    return SkillLevel.MINIMAL


def _confidence_from_evidence_count(count: int) -> Confidence:
    if count >= 4:
        return Confidence.HIGH
    if count >= 2:
        return Confidence.MEDIUM
    return Confidence.LOW


def _normalize_language(name: str | None) -> str | None:
    if not name:
        return None
    return LANGUAGE_ALIASES.get(name.lower(), name)


class SkillSignalsEngine:
    """Extract structured signals before any LLM reasoning."""

    def extract(self, github_data: dict[str, Any]) -> dict[str, Any]:
        user = github_data["user"]
        repos = github_data.get("repos", [])
        languages: Counter[str] = Counter()
        topics: Counter[str] = Counter()
        dependency_hits: Counter[str] = Counter()
        repo_evidence: list[Evidence] = []

        for repo in repos:
            lang = _normalize_language(repo.get("language"))
            if lang:
                languages[lang] += max(repo.get("stargazers_count", 0), 1)

            for topic in repo.get("topics", []):
                topics[topic.lower()] += 1

            for skill, markers in DEPENDENCY_SIGNALS.items():
                deps_blob = " ".join(repo.get("dependency_markers", [])).lower()
                if any(marker in deps_blob for marker in markers):
                    dependency_hits[skill] += 1

            if lang or repo.get("description"):
                repo_evidence.append(
                    Evidence(
                        type=EvidenceType.REPOSITORY,
                        title=repo["name"],
                        url=repo.get("html_url"),
                        summary=repo.get("description") or f"Primary language: {lang or 'unknown'}",
                        weight=min(1.0, 0.3 + repo.get("stargazers_count", 0) / 100),
                    )
                )

        return {
            "user": user,
            "languages": dict(languages.most_common(15)),
            "topics": dict(topics.most_common(20)),
            "dependency_hits": dict(dependency_hits),
            "repo_evidence": repo_evidence,
            "stats": {
                "repo_count": len(repos),
                "total_stars": sum(r.get("stargazers_count", 0) for r in repos),
                "recent_pushes": sum(1 for r in repos if r.get("pushed_at")),
            },
        }

    def build_profile(self, signals: dict[str, Any]) -> DeveloperProfile:
        user = signals["user"]
        languages: dict[str, int] = signals["languages"]
        dependency_hits: dict[str, int] = signals["dependency_hits"]
        repo_evidence: list[Evidence] = signals["repo_evidence"]
        stats = signals["stats"]

        max_lang = max(languages.values()) if languages else 1
        skills: list[SkillClaim] = []

        for lang, weight in languages.items():
            score = min(10.0, 3.0 + (weight / max_lang) * 6.5)
            evidence = [e for e in repo_evidence if lang.lower() in e.summary.lower()][:3]
            if not evidence:
                evidence = repo_evidence[:2]
            skills.append(
                SkillClaim(
                    name=lang,
                    level=_level_from_score(score),
                    confidence=_confidence_from_evidence_count(len(evidence)),
                    score=round(score, 1),
                    evidence=evidence,
                )
            )

        for skill, hits in dependency_hits.items():
            score = min(10.0, 4.0 + hits * 2.0)
            skills.append(
                SkillClaim(
                    name=skill,
                    level=_level_from_score(score),
                    confidence=_confidence_from_evidence_count(hits),
                    score=round(score, 1),
                    evidence=[
                        Evidence(
                            type=EvidenceType.DEPENDENCY,
                            title=skill,
                            summary=f"Detected in {hits} repository dependency manifests",
                            weight=0.7,
                        )
                    ],
                )
            )

        skills.sort(key=lambda s: s.score, reverse=True)

        domain_scores: defaultdict[str, float] = defaultdict(float)
        domain_evidence: defaultdict[str, list[Evidence]] = defaultdict(list)
        corpus = " ".join(
            [
                " ".join(languages.keys()).lower(),
                " ".join(signals.get("topics", {}).keys()).lower(),
                " ".join(dependency_hits.keys()).lower(),
            ]
        )
        for domain, keywords in DOMAIN_RULES:
            hits = sum(1 for kw in keywords if kw in corpus)
            if hits:
                domain_scores[domain] += hits
                domain_evidence[domain].append(
                    Evidence(
                        type=EvidenceType.TOPIC,
                        title=domain,
                        summary=f"Matched {hits} domain keyword signals",
                        weight=min(1.0, hits / 5),
                    )
                )

        domains = [
            DomainClaim(
                name=name,
                level=_level_from_score(min(10.0, 3.0 + score * 1.5)),
                confidence=_confidence_from_evidence_count(len(domain_evidence[name])),
                evidence=domain_evidence[name],
            )
            for name, score in sorted(domain_scores.items(), key=lambda x: x[1], reverse=True)
        ]

        primary_stack = [s.name for s in skills[:5]]
        strengths = [d.name for d in domains[:3]] or ["General Software Development"]
        weaknesses: list[str] = []
        if stats["repo_count"] < 5:
            weaknesses.append("Limited public repository footprint")
        if "Open Source" not in {d.name for d in domains}:
            weaknesses.append("Open Source Contributions")
        if not any(s.name.lower() in {"markdown", "documentation"} for s in skills):
            weaknesses.append("Technical Writing")

        maturity = min(
            10.0,
            2.0
            + min(stats["repo_count"], 20) * 0.2
            + min(stats["total_stars"], 500) / 100
            + len(skills) * 0.2,
        )

        summary = (
            f"{user['login']} shows strongest activity in {', '.join(primary_stack[:3]) or 'software development'}. "
            f"Public footprint spans {stats['repo_count']} analyzed repositories with "
            f"{stats['total_stars']} total stars."
        )

        return DeveloperProfile(
            username=user["login"],
            display_name=user.get("name"),
            bio=user.get("bio"),
            analyzed_at=datetime.now(timezone.utc),
            summary=summary,
            primary_stack=primary_stack,
            skills=skills[:12],
            domains=domains[:6],
            strengths=strengths,
            weaknesses=weaknesses,
            maturity_score=round(maturity, 1),
            repo_count=stats["repo_count"],
            public_repos=user.get("public_repos", stats["repo_count"]),
            total_stars=stats["total_stars"],
        )
