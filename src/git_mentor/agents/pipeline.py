"""Supervisor pipeline orchestrating ingest → signals → agents."""

from __future__ import annotations

import time

from git_mentor.agents.coach import CareerCoachAgent
from git_mentor.agents.growth import GrowthAdvisorAgent
from git_mentor.agents.profile import ProfileSynthesizerAgent
from git_mentor.core.config import GitMentorConfig
from git_mentor.core.profiles.roles import get_role
from git_mentor.core.schemas import AgentStepTrace, AnalysisResult
from git_mentor.core.signals.engine import SkillSignalsEngine
from git_mentor.github.ingestor import GitHubIngestor
from git_mentor.llm.router import LLMRouter


class AnalysisPipeline:
    def __init__(self, config: GitMentorConfig) -> None:
        self.config = config
        self.ingestor = GitHubIngestor(config)
        self.signals_engine = SkillSignalsEngine()
        self.router = LLMRouter(config)
        self.profile_agent = ProfileSynthesizerAgent(self.router, self.signals_engine)
        self.coach_agent = CareerCoachAgent(self.router)
        self.growth_agent = GrowthAdvisorAgent(self.router)

    async def run(
        self,
        username: str,
        *,
        role_id: str | None = None,
        include_coach: bool = True,
        include_growth: bool = True,
        repo_limit: int = 30,
        github_data: dict | None = None,
    ) -> AnalysisResult:
        traces: list[AgentStepTrace] = []
        role_id = role_id or self.config.default_role

        ingest_started = time.perf_counter()
        if github_data is None:
            github_data = self.ingestor.fetch_profile_data(username, repo_limit=repo_limit)
        ingest_ms = int((time.perf_counter() - ingest_started) * 1000)
        traces.append(
            AgentStepTrace(
                agent="supervisor",
                step="github-ingest",
                duration_ms=ingest_ms,
                input_summary=f"username={username}",
                output_summary=f"repos={len(github_data.get('repos', []))}",
            )
        )

        signals_started = time.perf_counter()
        signals = self.signals_engine.extract(github_data)
        signals_ms = int((time.perf_counter() - signals_started) * 1000)
        traces.append(
            AgentStepTrace(
                agent="supervisor",
                step="skill-signals",
                duration_ms=signals_ms,
                input_summary=f"repos={len(github_data.get('repos', []))}",
                output_summary=f"languages={len(signals.get('languages', {}))}",
            )
        )

        profile, profile_trace = await self.profile_agent.synthesize(github_data, signals)
        traces.append(profile_trace)

        gap_analysis = None
        if include_coach:
            role = get_role(role_id)
            gap_analysis, coach_trace = await self.coach_agent.analyze(profile, role)
            traces.append(coach_trace)

        action_plan = None
        if include_growth:
            action_plan, growth_trace = await self.growth_agent.recommend(
                profile,
                gap_analysis,
                role_id=role_id,
            )
            traces.append(growth_trace)

        return AnalysisResult(
            profile=profile,
            gap_analysis=gap_analysis,
            action_plan=action_plan,
            traces=traces,
            signals=signals,
        )
