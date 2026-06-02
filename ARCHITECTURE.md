# Architecture

## Product surfaces

| Surface | Purpose |
|---------|---------|
| **CLI** (`git-mentor`) | Primary product — local analysis, private repos via PAT/gh |
| **MCP server** (`git-mentor mcp`) | IDE integration (Cursor, Claude Desktop) |
| **HF Space** (`space/app.py`) | Public demo on Hugging Face — public profiles only |

No web app. No hosted backend.

## Pipeline

1. **GitHub Ingestor** — fetches user, repos, languages, dependency manifests (cached locally)
2. **Skill Signals Engine** — deterministic extraction (languages, deps, topics, domains)
3. **Profile Synthesizer** — builds `DeveloperProfile` with evidence; optional LLM summary polish
4. **Career Coach** — gap analysis vs `RoleTemplate`
5. **Growth Advisor** — actionable recommendations
6. **Export** — Markdown dossier + JSON

## LLM abstraction

`LLMRouter` selects provider from config:

- `OllamaProvider` — local or remote Ollama
- `OpenAICompatibleProvider` — OpenAI, OpenRouter, Anthropic-compatible endpoints
- `DeterministicProvider` — no LLM; rules-only fallback

The pipeline always works in deterministic mode. LLM enhances summaries only.

## Data storage

All local:

- Config: `~/.config/git-mentor/config.yaml`
- Cache: `~/.local/share/git-mentor/cache/` (GitHub API responses)
- Reports: `~/.local/share/git-mentor/reports/` (JSON + Markdown)

## MCP tools

| Tool | Description |
|------|-------------|
| `analyze_profile` | Full technical dossier |
| `compare_role` | Gap analysis JSON |
| `get_recommendations` | Action plan JSON |
| `list_target_roles` | Available roles |

## HF Space constraints

- Public profiles only (no user OAuth in Space)
- GitHub token via Space secrets (optional, for rate limits)
- Default: deterministic mode (fast, no GPU)
- Shares `src/git_mentor` via `sys.path` — same core as CLI

## Agent trace

Every pipeline step emits `AgentStepTrace` (agent, step, duration, summary).
Visible in CLI reports and Space "Agent Trace" tab.
