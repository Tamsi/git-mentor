"""Target role templates for career coaching."""

from git_mentor.core.schemas import RoleTemplate

ROLE_TEMPLATES: dict[str, RoleTemplate] = {
    "ai-engineer": RoleTemplate(
        id="ai-engineer",
        name="AI Engineer",
        description="Builds production AI systems: LLMs, RAG, agents, evals.",
        required_skills=["Python", "LLM Engineering", "RAG", "API Design"],
        required_domains=["AI Engineering", "Backend Architecture"],
        nice_to_have=["MCP", "LangGraph", "Evaluation", "Vector Databases"],
    ),
    "full-stack": RoleTemplate(
        id="full-stack",
        name="Full Stack Engineer",
        description="Ships end-to-end product features across frontend and backend.",
        required_skills=["TypeScript", "React", "API Design", "SQL"],
        required_domains=["Frontend", "Backend Architecture"],
        nice_to_have=["DevOps", "Testing", "Performance"],
    ),
    "staff-engineer": RoleTemplate(
        id="staff-engineer",
        name="Staff Engineer",
        description="Sets technical direction, unblocks teams, drives cross-cutting quality.",
        required_skills=["System Design", "API Design", "Technical Leadership"],
        required_domains=["Backend Architecture", "Cloud Infrastructure"],
        nice_to_have=["Mentoring", "Technical Writing", "Open Source"],
    ),
    "software-architect": RoleTemplate(
        id="software-architect",
        name="Software Architect",
        description="Designs scalable systems and guides long-term platform decisions.",
        required_skills=["System Design", "Cloud Infrastructure", "API Design"],
        required_domains=["Backend Architecture", "Cloud Infrastructure"],
        nice_to_have=["Security", "Data Architecture", "Event-Driven Systems"],
    ),
    "oss-maintainer": RoleTemplate(
        id="oss-maintainer",
        name="Open Source Maintainer",
        description="Leads community-driven projects with sustained OSS contributions.",
        required_skills=["Open Source", "Technical Writing", "Code Review"],
        required_domains=["Open Source", "Community"],
        nice_to_have=["CI/CD", "Documentation", "Release Management"],
    ),
}


def get_role(role_id: str) -> RoleTemplate:
    key = role_id.lower().replace("_", "-").replace(" ", "-")
    if key not in ROLE_TEMPLATES:
        available = ", ".join(sorted(ROLE_TEMPLATES))
        raise ValueError(f"Unknown role '{role_id}'. Available: {available}")
    return ROLE_TEMPLATES[key]


def list_roles() -> list[RoleTemplate]:
    return list(ROLE_TEMPLATES.values())
