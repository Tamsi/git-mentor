# git-mentor

Evidence-backed GitHub career intelligence — **TypeScript/Node**, **chat-first**, **CLI**, **MCP**, and **Hugging Face Space**.

## Install

Requires **Node.js 20+**.

### From npm (recommended)

```bash
npm install -g git-mentor
```

The CLI command is **`gitmentor`** (`git-mentor` remains available as an alias). Then configure Ollama:

```bash
gitmentor init --provider ollama --model qwen3:8b
gitmentor doctor
```

### From source (development)

```bash
git clone <repo>
cd git-mentor
npm install -g .
# postinstall runs pnpm install + build automatically
```

Or manually:

```bash
pnpm install
pnpm build
npm install -g .
```

> **Note:** Prefer `npm install -g .` from the repo root (not `./packages/cli`) so runtime dependencies resolve correctly.

## Chat (primary interface)

### CLI chat

```bash
gitmentor                    # your GitHub profile (needs gh auth or token)
gitmentor octocat            # public profile
gitmentor me --role staff-engineer
gitmentor chat octocat       # same as above (alias)
```

Example questions:
- « What are my biggest gaps for Staff Engineer? »
- « What should I learn in the next 3 months? »
- « Which OSS projects fit my stack? »

Commands inside chat: `/analyze profile`, `/analyze <repo>`, `/role`, `/model`, `/gaps`, `/growth`, `/trending`, `/improve`, `/export`, `/help`, `/quit`

### Stack

- **Commander.js** — CLI structure (`init`, `chat`, `model`, `analyze`, …)
- **Ink + React** — interactive chat, model picker, Ollama sign-in
- **ink-text-input**, **ink-select-input**, **ink-spinner** — terminal UI primitives
- **Chalk** — colors for one-shot commands (`doctor`, `analyze`, …)

```bash
gitmentor model              # interactive picker
gitmentor model signin       # Ollama cloud login (opens browser)
gitmentor model qwen3:8b     # set model directly
gitmentor model --list       # plain text list
```

In chat: `/model` opens the picker · `/model signin` for Ollama cloud · `/model glm-5.1` to set directly

Cloud models require Ollama sign-in (`/model signin` or `gitmentor model signin`).

### Local app (browser)

```bash
gitmentor app
# → http://localhost:3847
```

## Setup

```bash
gitmentor init --provider ollama --model qwen3:8b
gitmentor auth
gitmentor doctor
```

For natural conversation, use **Ollama** (local) or set `GIT_MENTOR_LLM_PROVIDER=openrouter`.

Deterministic mode works for slash commands only: `gitmentor octocat --deterministic`

## Other commands

Legacy one-shot commands still available:

```bash
gitmentor analyze octocat --deterministic
gitmentor eval
gitmentor mcp    # MCP server for Cursor
```

## MCP (Cursor)

Tools: `analyze_profile`, `compare_role`, `get_recommendations`, `discover_trending_repos`, `improve_profile`, `list_target_roles`

```json
{
  "mcpServers": {
    "git-mentor": {
      "command": "gitmentor",
      "args": ["mcp"]
    }
  }
}
```

## Monorepo

```
packages/core · github · llm · agents · chat · cli
apps/space   — HF demo (Docker)
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter git-mentor dev octocat --deterministic
```

## License

MIT
