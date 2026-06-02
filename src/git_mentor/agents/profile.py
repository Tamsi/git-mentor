"""Profile synthesizer agent — optional LLM polish on deterministic profile."""

from __future__ import annotations

import time

from git_mentor.core.schemas import AgentStepTrace, DeveloperProfile
from git_mentor.core.signals.engine import SkillSignalsEngine
from git_mentor.llm.router import LLMRouter


class ProfileSynthesizerAgent:
    def __init__(self, router: LLMRouter, signals_engine: SkillSignalsEngine | None = None) -> None:
        self.router = router
        self.signals_engine = signals_engine or SkillSignalsEngine()

    async def synthesize(
        self,
        github_data: dict,
        signals: dict,
    ) -> tuple[DeveloperProfile, AgentStepTrace]:
        started = time.perf_counter()
        profile = self.signals_engine.build_profile(signals)

        prompt = (
            "Rewrite this developer profile summary in 2 sentences, factual, no scores:\n"
            f"{profile.summary}\n"
            f"Stack: {', '.join(profile.primary_stack)}\n"
            f"Strengths: {', '.join(profile.strengths)}\n"
            f"Weaknesses: {', '.join(profile.weaknesses)}"
        )
        llm_result = await self.router.complete(
            prompt,
            system="You write evidence-backed developer profile summaries.",
        )
        if llm_result.content.strip() and llm_result.provider != "deterministic":
            profile.summary = llm_result.content.strip()

        duration_ms = int((time.perf_counter() - started) * 1000)
        trace = AgentStepTrace(
            agent="profile-synthesizer",
            step="synthesize",
            duration_ms=duration_ms,
            input_summary=f"repos={len(github_data.get('repos', []))}",
            output_summary=f"skills={len(profile.skills)}, maturity={profile.maturity_score}",
        )
        return profile, trace
