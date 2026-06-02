"""Growth advisor agent — actionable recommendations."""

from __future__ import annotations

import time

from git_mentor.core.schemas import (
    ActionItem,
    ActionPlan,
    AgentStepTrace,
    DeveloperProfile,
    GapAnalysis,
)
from git_mentor.llm.router import LLMRouter

ROLE_REPOS: dict[str, list[str]] = {
    "ai-engineer": [
        "langchain-ai/langgraph",
        "ollama/ollama",
        "huggingface/transformers",
    ],
    "staff-engineer": [
        "kubernetes/kubernetes",
        "grpc/grpc",
        "prometheus/prometheus",
    ],
    "oss-maintainer": [
        "firstcontributions/first-contributions",
        "up-for-grabs/up-for-grabs.net",
    ],
}

DEFAULT_REPOS = ["github/explore", "sindresorhus/awesome"]


class GrowthAdvisorAgent:
    def __init__(self, router: LLMRouter) -> None:
        self.router = router

    async def recommend(
        self,
        profile: DeveloperProfile,
        gap_analysis: GapAnalysis | None = None,
        *,
        role_id: str = "ai-engineer",
        top_n: int = 5,
    ) -> tuple[ActionPlan, AgentStepTrace]:
        started = time.perf_counter()
        recommendations: list[ActionItem] = []

        for weakness in profile.weaknesses[:2]:
            recommendations.append(
                ActionItem(
                    title=f"Improve {weakness}",
                    category="growth",
                    description=f"Create a recurring habit to address {weakness.lower()}.",
                    effort="M",
                    rationale=f"Detected as a profile weakness for @{profile.username}.",
                )
            )

        if gap_analysis:
            for gap in gap_analysis.gaps[:3]:
                recommendations.append(
                    ActionItem(
                        title=f"Close gap: {gap.area}",
                        category="learning",
                        description=gap.rationale,
                        effort="M" if gap.priority >= 4 else "S",
                        rationale=f"Required for {gap_analysis.target_role}.",
                    )
                )

        for skill in profile.primary_stack[:2]:
            recommendations.append(
                ActionItem(
                    title=f"Deepen expertise in {skill}",
                    category="depth",
                    description=f"Publish a technical write-up or OSS utility showcasing {skill}.",
                    effort="S",
                    rationale="Build on an existing strength with public evidence.",
                )
            )

        technologies = []
        if gap_analysis:
            technologies = [g.area for g in gap_analysis.gaps[:5]]
        technologies.extend(
            t for t in ["LangGraph", "MCP", "AI Evaluation"] if t not in technologies
        )

        repos = ROLE_REPOS.get(role_id, DEFAULT_REPOS)
        oss = [
            "Find a repo in your primary stack with `good first issue` labels",
            "Review one PR per week in a project you depend on",
        ]

        duration_ms = int((time.perf_counter() - started) * 1000)
        trace = AgentStepTrace(
            agent="growth-advisor",
            step="recommendations",
            duration_ms=duration_ms,
            input_summary=f"username={profile.username}, role={role_id}",
            output_summary=f"recommendations={len(recommendations[:top_n])}",
        )

        from datetime import datetime, timezone

        return (
            ActionPlan(
                generated_at=datetime.now(timezone.utc),
                recommendations=recommendations[:top_n],
                technologies_to_learn=technologies[:5],
                repos_to_watch=repos,
                oss_opportunities=oss,
            ),
            trace,
        )
