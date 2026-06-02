"""git-mentor CLI entrypoint."""

from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from git_mentor.agents.pipeline import AnalysisPipeline
from git_mentor.core.config import (
    CONFIG_FILE,
    REPORTS_DIR,
    ensure_dirs,
    load_config,
    save_config,
)
from git_mentor.core.profiles.roles import list_roles
from git_mentor.core.schemas import AnalysisResult
from git_mentor.eval.benchmark import format_report, run_benchmark
from git_mentor.export.markdown import render_markdown
from git_mentor.llm.router import LLMRouter

app = typer.Typer(
    name="git-mentor",
    help="Evidence-backed GitHub career intelligence — local-first CLI.",
    no_args_is_help=True,
)
console = Console()


def _run(coro):
    return asyncio.run(coro)


def _resolve_username(username: str, config) -> str:
    if username in {"me", "self", "@me"}:
        token = config.github.token
        if not token:
            try:
                result = subprocess.run(
                    ["gh", "api", "user", "-q", ".login"],
                    capture_output=True,
                    text=True,
                    check=True,
                )
                return result.stdout.strip()
            except (FileNotFoundError, subprocess.CalledProcessError) as exc:
                raise typer.BadParameter(
                    "Could not resolve your GitHub username. Use `git-mentor auth` or pass @username."
                ) from exc
        import httpx

        response = httpx.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {token}"},
            timeout=20.0,
        )
        response.raise_for_status()
        return response.json()["login"]
    return username.lstrip("@")


@app.command()
def init(
    provider: str = typer.Option("ollama", help="LLM provider"),
    model: str = typer.Option("qwen3:8b", help="Model name"),
    base_url: str = typer.Option("http://localhost:11434", help="LLM base URL"),
    role: str = typer.Option("ai-engineer", help="Default target role"),
) -> None:
    """Initialize local configuration."""
    ensure_dirs()
    config = load_config()
    config.llm.provider = provider
    config.llm.model = model
    config.llm.base_url = base_url
    config.default_role = role
    save_config(config)
    console.print(Panel.fit(f"Config written to [cyan]{CONFIG_FILE}[/cyan]", title="git-mentor init"))


@app.command()
def auth() -> None:
    """Detect GitHub authentication (gh CLI or PAT)."""
    config = load_config()
    try:
        result = subprocess.run(
            ["gh", "auth", "status"],
            capture_output=True,
            text=True,
            check=True,
        )
        config.github.use_gh_cli = True
        save_config(config)
        console.print(Panel(result.stdout.strip(), title="GitHub CLI detected"))
        return
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    if config.github.token:
        console.print("[green]GitHub token found in config/env.[/green]")
    else:
        console.print(
            "[yellow]No GitHub auth detected.[/yellow]\n"
            "Options:\n"
            "  1. Run [cyan]gh auth login[/cyan]\n"
            "  2. Export [cyan]GIT_MENTOR_GITHUB_TOKEN[/cyan]\n"
            "  3. Analyze public profiles with [cyan]git-mentor analyze @username --public[/cyan]"
        )


@app.command("roles")
def roles_cmd() -> None:
    """List available target roles."""
    table = Table(title="Target Roles")
    table.add_column("ID")
    table.add_column("Name")
    table.add_column("Description")
    for role in list_roles():
        table.add_row(role.id, role.name, role.description)
    console.print(table)


@app.command()
def analyze(
    username: str = typer.Argument("me", help="GitHub username or 'me'"),
    role: Optional[str] = typer.Option(None, "--role", "-r", help="Target role id"),
    public: bool = typer.Option(False, "--public", help="Public profile mode (no auth needed)"),
    refresh: bool = typer.Option(False, "--refresh", help="Bypass cache"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Write Markdown report"),
    json_out: Optional[Path] = typer.Option(None, "--json", help="Write JSON result"),
    provider: Optional[str] = typer.Option(None, help="Override LLM provider"),
    deterministic: bool = typer.Option(
        False, "--deterministic", help="Skip LLM (signals only)"
    ),
) -> None:
    """Analyze a GitHub profile and build a technical dossier."""
    config = load_config()
    if provider:
        config.llm.provider = provider
    if deterministic:
        config.llm.provider = "deterministic"
    if refresh:
        config.cache_ttl_hours = 0

    resolved = _resolve_username(username, config) if not public else username.lstrip("@")
    console.print(f"[bold]Analyzing[/bold] @{resolved} ...")

    pipeline = AnalysisPipeline(config)
    result = _run(
        pipeline.run(
            resolved,
            role_id=role or config.default_role,
            include_coach=True,
            include_growth=True,
        )
    )

    _print_summary(result)
    _persist_result(result, output, json_out)


@app.command()
def coach(
    username: str = typer.Argument("me", help="GitHub username or 'me'"),
    role: str = typer.Option("ai-engineer", "--role", "-r", help="Target role id"),
    output: Optional[Path] = typer.Option(None, "--output", "-o"),
) -> None:
    """Run career gap analysis against a target role."""
    config = load_config()
    resolved = _resolve_username(username, config)
    pipeline = AnalysisPipeline(config)
    result = _run(
        pipeline.run(resolved, role_id=role, include_coach=True, include_growth=False)
    )
    if result.gap_analysis:
        console.print(Panel(result.gap_analysis.summary, title=f"Gap Analysis — {role}"))
        for gap in result.gap_analysis.gaps:
            console.print(f"- [bold]{gap.area}[/bold]: {gap.rationale}")
    _persist_result(result, output, None)


@app.command()
def growth(
    username: str = typer.Argument("me", help="GitHub username or 'me'"),
    role: str = typer.Option("ai-engineer", "--role", "-r"),
    top: int = typer.Option(5, "--top", help="Number of recommendations"),
    output: Optional[Path] = typer.Option(None, "--output", "-o"),
) -> None:
    """Generate personalized growth recommendations."""
    config = load_config()
    resolved = _resolve_username(username, config)
    pipeline = AnalysisPipeline(config)
    result = _run(pipeline.run(resolved, role_id=role, include_coach=True, include_growth=True))
    if result.action_plan:
        for rec in result.action_plan.recommendations[:top]:
            console.print(f"- [bold]{rec.title}[/bold] [{rec.effort}] — {rec.description}")
    _persist_result(result, output, None)


@app.command()
def export(
    username: str = typer.Argument("me", help="GitHub username or 'me'"),
    role: Optional[str] = typer.Option(None, "--role", "-r"),
    output: Path = typer.Option(..., "--output", "-o", help="Markdown output path"),
    include_evidence: bool = typer.Option(True, "--include-evidence/--no-evidence"),
) -> None:
    """Export a full technical dossier to Markdown."""
    config = load_config()
    resolved = _resolve_username(username, config)
    pipeline = AnalysisPipeline(config)
    result = _run(pipeline.run(resolved, role_id=role or config.default_role))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_markdown(result, include_evidence=include_evidence))
    console.print(f"[green]Exported[/green] {output}")


@app.command()
def doctor() -> None:
    """Check local setup (config, GitHub auth, LLM)."""
    config = load_config()
    if CONFIG_FILE.exists():
        console.print(f"Config: {CONFIG_FILE} [green]OK[/green]")
    else:
        console.print(f"Config: {CONFIG_FILE} [yellow]missing[/yellow]")

    auth_ok = False
    try:
        subprocess.run(["gh", "auth", "status"], capture_output=True, check=True)
        auth_ok = True
        console.print("GitHub: [green]gh CLI authenticated[/green]")
    except (FileNotFoundError, subprocess.CalledProcessError):
        if config.github.token:
            auth_ok = True
            console.print("GitHub: [green]token configured[/green]")
        else:
            console.print("GitHub: [yellow]no auth (public profiles only)[/yellow]")

    status = _run(LLMRouter(config).health_check())
    color = "green" if status.ok else "yellow"
    console.print(f"LLM ({config.llm.provider}): [{color}]{status.message}[/{color}]")


@app.command("eval")
def eval_cmd(
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Write Markdown report"),
    json_out: bool = typer.Option(False, "--json", help="Print JSON summary"),
    dataset: Optional[Path] = typer.Option(None, "--dataset", help="Custom dataset path"),
) -> None:
    """Run skill detection benchmark against synthetic profiles."""
    report = run_benchmark(dataset)
    md = format_report(report)

    if json_out:
        payload = {
            "total": report.total,
            "passed": report.passed,
            "pass_rate": report.pass_rate,
            "avg_skill_recall": report.avg_skill_recall,
            "avg_domain_recall": report.avg_domain_recall,
            "results": [
                {
                    "profile_id": r.profile_id,
                    "passed": r.passed,
                    "skill_recall": r.skill_recall,
                    "domain_recall": r.domain_recall,
                    "missing_skills": r.missing_skills,
                    "missing_domains": r.missing_domains,
                }
                for r in report.results
            ],
        }
        console.print_json(json.dumps(payload))
    else:
        console.print(md)

    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(md)
        console.print(f"[green]Report[/green] → {output}")

    if report.pass_rate < 0.8:
        raise typer.Exit(code=1)


@app.command()
def mcp() -> None:
    """Start the MCP server (requires `pip install git-mentor[mcp]`)."""
    try:
        from git_mentor.mcp.server import run_server
    except ImportError as exc:
        raise typer.BadParameter("Install MCP extras: pip install 'git-mentor[mcp]'") from exc
    run_server()


def _print_summary(result: AnalysisResult) -> None:
    profile = result.profile
    console.print(
        Panel(
            f"{profile.summary}\n\n"
            f"Maturity: [bold]{profile.maturity_score}/10[/bold] · "
            f"Repos: {profile.repo_count} · Stars: {profile.total_stars}",
            title=f"@{profile.username}",
        )
    )
    if profile.skills:
        table = Table(title="Top Skills")
        table.add_column("Skill")
        table.add_column("Level")
        table.add_column("Score")
        table.add_column("Confidence")
        for skill in profile.skills[:8]:
            table.add_row(skill.name, skill.level.value, str(skill.score), skill.confidence.value)
        console.print(table)


def _persist_result(
    result: AnalysisResult,
    md_path: Path | None,
    json_path: Path | None,
) -> None:
    ensure_dirs()
    if json_path:
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(result.model_dump_json(indent=2))
        console.print(f"[green]JSON[/green] → {json_path}")
    elif md_path is None:
        default_json = REPORTS_DIR / f"{result.profile.username}.json"
        default_json.write_text(result.model_dump_json(indent=2))

    target_md = md_path or REPORTS_DIR / f"{result.profile.username}.md"
    if md_path or not (REPORTS_DIR / f"{result.profile.username}.md").exists():
        target_md.write_text(render_markdown(result))
        console.print(f"[green]Report[/green] → {target_md}")


if __name__ == "__main__":
    app()
