"""Career coach agent — gap analysis vs target role."""

from __future__ import annotations

import time

from git_mentor.core.profiles.roles import RoleTemplate
from git_mentor.core.schemas import (
    AgentStepTrace,
    DeveloperProfile,
    GapAnalysis,
    GapItem,
    LearningStep,
    SkillLevel,
)
from git_mentor.llm.router import LLMRouter


def _level_rank(level: SkillLevel) -> int:
    order = {
        SkillLevel.MINIMAL: 0,
        SkillLevel.EMERGING: 1,
        SkillLevel.INTERMEDIATE: 2,
        SkillLevel.ADVANCED: 3,
        SkillLevel.EXPERT: 4,
    }
    return order[level]


class CareerCoachAgent:
    def __init__(self, router: LLMRouter) -> None:
        self.router = router

    async def analyze(
        self,
        profile: DeveloperProfile,
        role: RoleTemplate,
    ) -> tuple[GapAnalysis, AgentStepTrace]:
        started = time.perf_counter()
        known_skills = {s.name.lower(): s for s in profile.skills}
        known_domains = {d.name.lower(): d for d in profile.domains}

        gaps: list[GapItem] = []
        strengths: list[str] = []

        for skill in role.required_skills:
            current = known_skills.get(skill.lower())
            if current and _level_rank(current.level) >= _level_rank(SkillLevel.ADVANCED):
                strengths.append(skill)
                continue
            gaps.append(
                GapItem(
                    area=skill,
                    current_level=current.level if current else SkillLevel.MINIMAL,
                    target_level=SkillLevel.ADVANCED,
                    priority=5,
                    rationale=f"{skill} is required for {role.name} and is not yet strongly evidenced.",
                    evidence_gaps=[f"Need more public work demonstrating {skill}"],
                )
            )

        for domain in role.required_domains:
            current = known_domains.get(domain.lower())
            if current and _level_rank(current.level) >= _level_rank(SkillLevel.INTERMEDIATE):
                if domain not in strengths:
                    strengths.append(domain)
                continue
            gaps.append(
                GapItem(
                    area=domain,
                    current_level=current.level if current else SkillLevel.MINIMAL,
                    target_level=SkillLevel.ADVANCED,
                    priority=4,
                    rationale=f"{domain} is a core domain for {role.name}.",
                )
            )

        fit_score = max(1.0, 10.0 - len(gaps) * 0.8)
        learning_plan = [
            LearningStep(
                title=f"Build evidence in {gap.area}",
                description=f"Ship or contribute to a public project that demonstrates {gap.area}.",
                effort="M" if gap.priority >= 4 else "S",
                resources=[f"Search GitHub trending repos tagged with {gap.area}"],
            )
            for gap in gaps[:5]
        ]

        summary = (
            f"Fit for {role.name}: {fit_score:.1f}/10. "
            f"{len(strengths)} aligned strengths, {len(gaps)} gaps to close."
        )

        llm_prompt = (
            f"Improve this one-sentence career summary for a developer targeting {role.name}:\n"
            f"{summary}\n"
            f"Profile summary: {profile.summary}\n"
            f"Keep it under 40 words, factual, no hype."
        )
        llm_result = await self.router.complete(
            llm_prompt,
            system="You are a staff engineer writing concise career feedback.",
        )
        if llm_result.content.strip():
            summary = llm_result.content.strip()

        duration_ms = int((time.perf_counter() - started) * 1000)
        trace = AgentStepTrace(
            agent="career-coach",
            step="gap-analysis",
            duration_ms=duration_ms,
            input_summary=f"role={role.id}, skills={len(profile.skills)}",
            output_summary=f"gaps={len(gaps)}, fit={fit_score:.1f}",
        )

        return (
            GapAnalysis(
                target_role=role.name,
                fit_score=round(fit_score, 1),
                summary=summary,
                gaps=gaps,
                learning_plan=learning_plan,
                strengths_for_role=strengths,
            ),
            trace,
        )
