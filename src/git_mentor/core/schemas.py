"""Shared domain schemas for git-mentor."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class SkillLevel(str, Enum):
    EXPERT = "expert"
    ADVANCED = "advanced"
    INTERMEDIATE = "intermediate"
    EMERGING = "emerging"
    MINIMAL = "minimal"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class EvidenceType(str, Enum):
    REPOSITORY = "repository"
    COMMIT = "commit"
    PULL_REQUEST = "pull_request"
    REVIEW = "review"
    DEPENDENCY = "dependency"
    TOPIC = "topic"
    LANGUAGE = "language"


class Evidence(BaseModel):
    type: EvidenceType
    title: str
    url: HttpUrl | None = None
    summary: str
    weight: float = Field(ge=0.0, le=1.0, default=0.5)
    occurred_at: datetime | None = None


class SkillClaim(BaseModel):
    name: str
    level: SkillLevel
    confidence: Confidence
    score: float = Field(ge=0.0, le=10.0)
    evidence: list[Evidence] = Field(default_factory=list)


class DomainClaim(BaseModel):
    name: str
    level: SkillLevel
    confidence: Confidence
    evidence: list[Evidence] = Field(default_factory=list)


class DeveloperProfile(BaseModel):
    username: str
    display_name: str | None = None
    bio: str | None = None
    analyzed_at: datetime
    summary: str
    primary_stack: list[str] = Field(default_factory=list)
    skills: list[SkillClaim] = Field(default_factory=list)
    domains: list[DomainClaim] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    maturity_score: float = Field(ge=0.0, le=10.0)
    repo_count: int = 0
    public_repos: int = 0
    total_stars: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class GapItem(BaseModel):
    area: str
    current_level: SkillLevel
    target_level: SkillLevel
    priority: int = Field(ge=1, le=5)
    rationale: str
    evidence_gaps: list[str] = Field(default_factory=list)


class LearningStep(BaseModel):
    title: str
    description: str
    effort: str = Field(description="S, M, or L")
    resources: list[str] = Field(default_factory=list)


class GapAnalysis(BaseModel):
    target_role: str
    fit_score: float = Field(ge=0.0, le=10.0)
    summary: str
    gaps: list[GapItem] = Field(default_factory=list)
    learning_plan: list[LearningStep] = Field(default_factory=list)
    strengths_for_role: list[str] = Field(default_factory=list)


class ActionItem(BaseModel):
    title: str
    category: str
    description: str
    effort: str
    rationale: str
    url: HttpUrl | None = None


class ActionPlan(BaseModel):
    generated_at: datetime
    recommendations: list[ActionItem] = Field(default_factory=list)
    technologies_to_learn: list[str] = Field(default_factory=list)
    repos_to_watch: list[str] = Field(default_factory=list)
    oss_opportunities: list[str] = Field(default_factory=list)


class AgentStepTrace(BaseModel):
    agent: str
    step: str
    duration_ms: int
    input_summary: str
    output_summary: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class AnalysisResult(BaseModel):
    profile: DeveloperProfile
    gap_analysis: GapAnalysis | None = None
    action_plan: ActionPlan | None = None
    traces: list[AgentStepTrace] = Field(default_factory=list)
    signals: dict[str, Any] = Field(default_factory=dict)


class RoleTemplate(BaseModel):
    id: str
    name: str
    description: str
    required_skills: list[str]
    required_domains: list[str]
    nice_to_have: list[str] = Field(default_factory=list)
