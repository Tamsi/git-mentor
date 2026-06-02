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
gitmentor                    # your GitHub profile (auto-loads with gh auth)
gitmentor octocat            # public profile
gitmentor me --role staff-engineer
gitmentor chat octocat       # same as above (alias)
```

With **`gh auth login`**, your profile loads **automatically** at startup. The coaching dossier is written to `~/.local/share/git-mentor/reports/<username>.md` (JSON alongside) and cached for `cacheTtlHours` (default 24h).

`/analyze profile` refreshes **profile attractiveness** (bio, README, pins, stats, activity) — not manifest/code scans (`/analyze <repo>` for those).

Example questions:
- « What are my biggest gaps for Staff Engineer? »
- « What should I learn in the next 3 months? »
- « Which OSS projects fit my stack? »

Commands inside chat: `/analyze profile`, `/analyze <repo>`, `/role`, `/model`, `/gaps`, `/growth`, `/trending`, `/follow`, `/improve`, `/export`, `/help`, `/quit`

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
gitmentor auth              # GitHub token status
gitmentor auth login        # browser sign-in (gh)
gitmentor auth refresh      # add user scope for follow
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

**Built-in tools:** `analyze_profile`, `compare_role`, `get_recommendations`, `discover_trending_repos`, `discover_profiles_to_follow`, `improve_profile`, `analyze_repository`, `list_target_roles`, `list_rules`, `list_skills`, `get_agent_context`

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

## Rules, skills & agent context

git-mentor injects **rules** and **skills** into the LLM system prompt (Cursor-style `SKILL.md`).

| Location | Purpose |
|----------|---------|
| `~/.config/git-mentor/rules/*.md` | Global coaching rules |
| `~/.config/git-mentor/skills/<id>/SKILL.md` | Global skills |
| `.git-mentor/rules/` · `.git-mentor/skills/` | Project-level overrides |

```bash
gitmentor init   # installs default GitHub-focused rules + skills
```

**Default rules:** `github-evidence-only`, `github-career-mission`, `github-signals`

**Default skills:** `gap-coaching`, `github-profile-optimization`, `repo-deep-scan`, `growth-and-trending`, `interview-prep` (active by default: `gap-coaching`, `github-profile-optimization`)

**Chat commands:** `/rules`, `/skills`, `/skills use repo-deep-scan`, `/mcp`, `/auth`, `/auth login`, `/auth refresh`

**Config** (`~/.config/git-mentor/config.yaml`):

With **`gh auth login`**, gitmentor **auto-enables a GitHub MCP server** (bundled in `@git-mentor/github`) for write actions: `fork_repository`, `follow_user`, etc. Career coaching stays in git-mentor MCP; GitHub operations go through GitHub MCP.

```yaml
mcp:
  servers:
    - name: github
      command: node
      args: ["…/node_modules/@git-mentor/github/dist/mcp-github-server.js"]
      enabled: true   # auto-enabled when gh auth is detected
```

Chat shortcuts:
- `/fork owner/repo` or `fork reponame` (after `/trending`) → MCP `fork_repository`
- `/follow` then `/follow apply` or `follow those profiles` → MCP `follow_user`

If follow fails with scope errors: `/auth refresh` in chat or `gitmentor auth refresh`

**MCP tools reference:** `~/.config/git-mentor/mcp/tools.md` (installed by `gitmentor init`) — built-in vs `github` server, scopes, chat shortcuts.

See `packages/cli/templates/agent/mcp/servers.example.json` for a starter MCP config.

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
