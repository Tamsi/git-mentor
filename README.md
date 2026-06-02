# git-mentor

Evidence-backed GitHub career intelligence — **CLI**, **MCP**, and **Hugging Face Space**.

Analyze repositories, languages, dependencies, and activity to build a verifiable technical profile,
compare against target roles (AI Engineer, Staff Engineer, …), and get actionable growth plans.

**Not a chatbot. Not a website.** Local-first agent pipeline with optional LLM polish.

[![Hugging Face Space](https://img.shields.io/badge/🤗-Try%20the%20Space-yellow)](https://huggingface.co/spaces/git-mentor/demo)

## Why git-mentor?

- **Evidence-backed** — skills link to repositories and dependency signals, not hallucinated scores
- **Deterministic first** — Skill Signals Engine runs before any LLM
- **LLM-agnostic** — Ollama local, OpenAI, OpenRouter, or fully deterministic mode
- **MCP-native** — use from Cursor / Claude Desktop
- **HF Space** — try on public `@username` without installing

## Quick start

```bash
# Install
pip install -e ".[dev]"

# Configure (Ollama local by default)
git-mentor init --provider ollama --model qwen3:8b

# Auth (optional — uses gh CLI if available)
git-mentor auth

# Analyze your profile
git-mentor analyze me

# Public profile (no auth)
git-mentor analyze torvalds --public --deterministic

# Career coach
git-mentor coach me --role staff-engineer

# Export dossier
git-mentor export me -o ./TECHNICAL_DOSSIER.md
```

## MCP (Cursor / Claude Desktop)

```bash
pip install "git-mentor[mcp]"
git-mentor mcp
```

Add to your MCP config:

```json
{
  "mcpServers": {
    "git-mentor": {
      "command": "git-mentor",
      "args": ["mcp"]
    }
  }
}
```

Tools: `analyze_profile`, `compare_role`, `get_recommendations`, `list_target_roles`

## Hugging Face Space

The `space/` directory deploys to Hugging Face as a Gradio demo:

```bash
# From repo root — push space/ to HF (or use HF Git integration)
```

Space features:
- Analyze any **public** GitHub username
- Target role selection
- Agent trace tab (transparency)
- Deterministic mode (no LLM required)

## Architecture

```
CLI / MCP / HF Space
        ↓
  Supervisor Pipeline
        ↓
 GitHub Ingestor → Skill Signals Engine → Agents → LLM Router
        ↓
  Technical Dossier (Markdown / JSON)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.

## LLM providers

| Provider | Use case |
|----------|----------|
| `ollama` | Local (default) — MacBook + Qwen/Llama/Gemma |
| `openai` | Remote OpenAI-compatible |
| `openrouter` | Multi-model routing |
| `deterministic` | No LLM — signals + rules only |

Configure via `~/.config/git-mentor/config.yaml` or env vars:

```bash
export GIT_MENTOR_LLM_PROVIDER=ollama
export GIT_MENTOR_LLM_MODEL=qwen3:8b
export GIT_MENTOR_LLM_BASE_URL=http://localhost:11434
export GIT_MENTOR_GITHUB_TOKEN=ghp_...
```

## Target roles

- `ai-engineer`
- `full-stack`
- `staff-engineer`
- `software-architect`
- `oss-maintainer`

```bash
git-mentor roles
```

## Project structure

```
git-mentor/
├── src/git_mentor/       # Core package (CLI, agents, MCP)
├── space/                # Hugging Face Gradio demo
├── eval/                 # Benchmark datasets (WIP)
├── examples/             # Sample outputs
└── tests/
```

## Evaluation

```bash
git-mentor eval
git-mentor eval --json
```

Benchmarks skill detection on synthetic profiles. See [eval/README.md](./eval/README.md).

## Development

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev,space,mcp]"
pytest
git-mentor doctor
```

## Roadmap

- [ ] Contribution Matcher (OSS issues by skill fit)
- [ ] Eval harness + HF dataset
- [ ] Profile diff over time
- [ ] Tech Radar (filtered trending)

## License

MIT
