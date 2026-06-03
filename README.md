<p align="center">
  <strong>git-mentor</strong><br/>
  <sub>Evidence-backed GitHub career intelligence — chat-first, local-first</sub>
</p>

<p align="center">
  <a href="https://github.com/Tamsi/git-mentor"><img src="https://img.shields.io/badge/GitHub-Tamsi%2Fgit--mentor-24292f?style=for-the-badge&logo=github" alt="GitHub"></a>
  <a href="https://www.npmjs.com/package/git-mentor"><img src="https://img.shields.io/npm/v/git-mentor?style=for-the-badge&color=D97757" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-3c873a?style=for-the-badge&logo=node.js&logoColor=white" alt="Node 20+">
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="License MIT">
</p>

**git-mentor** is a terminal coach for your GitHub presence: profile attractiveness, repo portfolio, social graph, and community discussions — with **evidence-only** advice (no invented stats or threads). It runs as an **Ink TUI**, ships a **bundled GitHub MCP server**, and exposes the same coaching brain to **Cursor** via MCP.

Use **Ollama** locally, **Ollama cloud**, or **OpenRouter**. Switch models with `gitmentor model` or `/model` in chat — no lock-in to a single vendor.

| | |
| --- | --- |
| **Real terminal UI** | Ink chat with streaming replies, slash commands, context bar, and a startup panel (model, MCP, skills). |
| **GitHub-native actions** | Profile, README, pins, fork, follow, discussions — via `gh` auth and MCP tools (human confirmation for writes). |
| **Coaching brain** | Rules + skills injected into every session (`gap-coaching`, profile optimization, repo deep-scan). |
| **Out of scope** | Issues, PRs, merge/review automation, local git clone / disk deep scan. |

---

## Quick install

Requires **Node.js 20+**.

```bash
npm install -g git-mentor
gitmentor init --provider ollama --model gpt-oss:20b
gitmentor login
gitmentor
```

From source:

```bash
git clone https://github.com/Tamsi/git-mentor.git
cd git-mentor
npm install -g .
# postinstall runs pnpm install + build
```

---

## Getting started

```bash
gitmentor              # Interactive chat (default: your GitHub user)
gitmentor octocat      # Coach a public profile
gitmentor login        # GitHub (gh) + Ollama cloud
gitmentor login gh     # GitHub only
gitmentor login ollama # Ollama cloud only
gitmentor model        # Pick LLM model
gitmentor auth         # GitHub token / scopes status
gitmentor doctor       # Config, gh, LLM, MCP checks
gitmentor init         # Rules, skills, tools.md, MCP entry
gitmentor mcp          # Built-in MCP server for Cursor
```

With **`gh auth login`**, your profile dossier loads at startup and is cached under `~/.local/share/git-mentor/reports/<username>.md`.

---

## CLI vs chat quick reference

| Action | Terminal (one-shot) | In chat |
| --- | --- | --- |
| Start coaching | `gitmentor` · `gitmentor chat @user` | (opens TUI) |
| Refresh profile audit | `gitmentor analyze me` | `/analyze profile` |
| Deep-scan a repo | `gitmentor analyze owner/repo` | `/analyze owner/repo` |
| Change model | `gitmentor model` | `/model` |
| Target role | `gitmentor me --role staff-engineer` | `/role <id>` |
| Followers / following | — | `/followers` · `/following` |
| Discussions | — | `/discussions` · `/discussions community` |
| Apply profile writes | — | `/apply bio` · `/apply readme` · `/apply pin` |
| Sign in | `gitmentor login [gh\|ollama]` | `/login` · `/login gh` |
| Help | `gitmentor --help` | `/help` |
| Quit | Ctrl+C | `/quit` · Esc (empty prompt) |

---

## Example questions

- What are my biggest gaps for Staff Engineer?
- Who follows me vs who do I follow?
- What should I improve on my profile README?
- Which threads are active on `community/community`?
- Fork and follow suggestions after `/trending`

---

## GitHub MCP (~26 tools)

Shipped on server `github` (auto-enabled when `gh` is authenticated):

**Read / search:** `get_user`, `list_followers`, `list_following`, `list_user_repositories`, `get_repository`, `get_repository_file`, `list_repository_commits`, `list_repository_branches`, `list_starred_repositories`, `search_repositories`, `search_code`, `search_discussions`, discussion list/get/comments.

**Write (own account only):** `update_user_profile`, `upsert_repository_file`, `update_repository_metadata`, `pin_repositories`, `fork_repository`, `follow_user`, `unfollow_user`, `create_repository`, `create_discussion`, `create_discussion_comment`.

Reference: `~/.config/git-mentor/mcp/tools.md` (regenerated on `gitmentor init`).

```bash
gitmentor auth refresh   # scopes for follow / fork / private repos
```

---

## MCP (Cursor)

**Built-in git-mentor server** (`gitmentor mcp`):

`analyze_profile`, `compare_role`, `get_recommendations`, `discover_trending_repos`, `discover_profiles_to_follow`, `improve_profile`, `analyze_repository`, `list_target_roles`, `list_rules`, `list_skills`, `get_agent_context`

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

Enable the bundled **github** server in `~/.config/git-mentor/config.yaml` (or run `gitmentor init` after `gh auth login`).

---

## Rules, skills & config

| Location | Purpose |
| --- | --- |
| `~/.config/git-mentor/config.yaml` | LLM, GitHub, MCP servers, active skills |
| `~/.config/git-mentor/rules/*.md` | Global coaching rules |
| `~/.config/git-mentor/skills/<id>/SKILL.md` | Procedural skills |
| `.git-mentor/rules/` · `.git-mentor/skills/` | Project overrides |

```bash
gitmentor init
```

In chat: `/rules`, `/skills`, `/skills use repo-deep-scan`, `/mcp`, `/export`

---

## Local app (browser)

```bash
gitmentor app
# → http://localhost:3847
```

---

## Monorepo

```
packages/core · github · llm · agents · chat · cli
```

---

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter git-mentor dev octocat --deterministic
```

---

## License

MIT — see [LICENSE](./LICENSE).
