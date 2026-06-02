"""MCP server exposing git-mentor analysis tools."""

from __future__ import annotations

import asyncio
import json

from git_mentor.agents.pipeline import AnalysisPipeline
from git_mentor.core.config import load_config
from git_mentor.core.profiles.roles import list_roles
from git_mentor.export.markdown import render_markdown


def run_server() -> None:
    try:
        from mcp.server.fastmcp import FastMCP
    except ImportError as exc:
        raise SystemExit("Install MCP support: pip install 'git-mentor[mcp]'") from exc

    mcp = FastMCP("git-mentor")
    config = load_config()
    pipeline = AnalysisPipeline(config)

    @mcp.tool()
    async def analyze_profile(username: str, role: str = "ai-engineer") -> str:
        """Analyze a public GitHub profile and return a technical dossier."""
        result = await pipeline.run(username.lstrip("@"), role_id=role)
        return render_markdown(result)

    @mcp.tool()
    async def compare_role(username: str, role: str = "ai-engineer") -> str:
        """Compare a GitHub profile against a target role and return gap analysis."""
        result = await pipeline.run(
            username.lstrip("@"),
            role_id=role,
            include_coach=True,
            include_growth=False,
        )
        if not result.gap_analysis:
            return "Gap analysis unavailable."
        return json.dumps(result.gap_analysis.model_dump(), indent=2, default=str)

    @mcp.tool()
    async def get_recommendations(username: str, role: str = "ai-engineer") -> str:
        """Return personalized growth recommendations for a GitHub profile."""
        result = await pipeline.run(username.lstrip("@"), role_id=role)
        if not result.action_plan:
            return "No recommendations generated."
        return json.dumps(result.action_plan.model_dump(), indent=2, default=str)

    @mcp.tool()
    async def list_target_roles() -> str:
        """List available career target roles."""
        return json.dumps([r.model_dump() for r in list_roles()], indent=2)

    mcp.run()


if __name__ == "__main__":
    run_server()
