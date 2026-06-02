"""Hugging Face Space — public GitHub profile demo for git-mentor."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import gradio as gr

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from git_mentor.agents.pipeline import AnalysisPipeline
from git_mentor.core.config import GitMentorConfig, LLMConfig
from git_mentor.core.profiles.roles import list_roles
from git_mentor.export.markdown import render_markdown

ROLE_CHOICES = [(r.name, r.id) for r in list_roles()]
SAMPLE_USER = "torvalds"


def _build_config(provider: str, model: str) -> GitMentorConfig:
    config = GitMentorConfig()
    config.llm.provider = provider
    config.llm.model = model
    if provider == "deterministic":
        config.llm.provider = "deterministic"
    return config


async def _run_analysis(username: str, role_id: str, provider: str, model: str) -> tuple[str, str, str]:
    username = username.strip().lstrip("@")
    if not username:
        raise gr.Error("Please enter a GitHub username.")

    config = _build_config(provider, model)
    pipeline = AnalysisPipeline(config)

    try:
        result = await pipeline.run(
            username,
            role_id=role_id,
            include_coach=True,
            include_growth=True,
            repo_limit=15,
        )
    except Exception as exc:
        raise gr.Error(
            f"Analysis failed: {exc}. "
            "Public profiles only. GitHub rate limits may apply — retry in a minute."
        ) from exc

    dossier = render_markdown(result)
    trace = json.dumps([t.model_dump() for t in result.traces], indent=2, default=str)
    raw = result.model_dump_json(indent=2)
    return dossier, trace, raw


def analyze(username: str, role_id: str, provider: str, model: str) -> tuple[str, str, str]:
    return asyncio.run(_run_analysis(username, role_id, provider, model))


def load_sample() -> str:
    return SAMPLE_USER


with gr.Blocks(title="git-mentor") as demo:
    gr.Markdown(
        """
# git-mentor

**Evidence-backed GitHub career intelligence** — analyze public profiles, compare against a target role,
and get actionable growth recommendations.

> This Space analyzes **public GitHub data only**. For private repos and local Ollama, install the CLI.
        """
    )

    with gr.Row():
        username = gr.Textbox(label="GitHub username", placeholder="octocat", value="")
        role = gr.Dropdown(
            label="Target role",
            choices=[r.id for r in list_roles()],
            value="ai-engineer",
        )

    with gr.Row():
        provider = gr.Dropdown(
            label="LLM provider",
            choices=["deterministic", "ollama", "openai", "openrouter"],
            value="deterministic",
            info="Use deterministic for fast demo without LLM. Ollama requires GPU/runtime setup.",
        )
        model = gr.Textbox(label="Model", value="qwen3:8b")

    with gr.Row():
        analyze_btn = gr.Button("Analyze", variant="primary")
        sample_btn = gr.Button("Load sample")

    with gr.Tabs():
        with gr.Tab("Technical Dossier"):
            dossier_out = gr.Markdown()
        with gr.Tab("Agent Trace"):
            trace_out = gr.Code(language="json")
        with gr.Tab("Raw JSON"):
            json_out = gr.Code(language="json")

    sample_btn.click(fn=load_sample, outputs=username)
    analyze_btn.click(
        fn=analyze,
        inputs=[username, role, provider, model],
        outputs=[dossier_out, trace_out, json_out],
    )

    gr.Markdown(
        """
---
**Disclaimer:** Public profiles only. Skill levels are inferred from public signals (languages, dependencies, topics)
and include evidence links when available. Not affiliated with GitHub.
        """
    )

demo.launch()
