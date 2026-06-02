# MCP tools reference (git-mentor)

Two MCP surfaces are used. Do not confuse them.

| Server | Command | Role |
|--------|---------|------|
| **git-mentor** | `gitmentor mcp` | Career coaching on GitHub profiles (read/analysis, no GitHub writes) |
| **github** | `node …/mcp-github-server.js` (auto-configured) | GitHub **write** actions via API (fork, follow, …) |

Enablement: `gh auth login` auto-registers the **github** server in `~/.config/git-mentor/config.yaml`. Check with `/mcp`.

---

## 1. Built-in server — `gitmentor mcp`

Use for profile analysis, gaps, growth plans, and agent context — **not** for forking or following users.

| Tool | Purpose |
|------|---------|
| `analyze_profile` | Full career profile analysis for a username + target role |
| `compare_role` | Gap analysis vs target role (JSON) |
| `get_recommendations` | Growth plan / action plan (JSON) |
| `discover_trending_repos` | Trending repos aligned with stack and role |
| `discover_profiles_to_follow` | Role-model GitHub users to study/follow |
| `improve_profile` | Profile attractiveness improvement plan |
| `analyze_repository` | Deep scan one repo (manifests, stack) |
| `analyze_repository_for_user` | Repo scan with owner shorthand |
| `list_target_roles` | Available career role templates |
| `list_rules` | Loaded coaching rules |
| `list_skills` | Loaded coaching skills |
| `get_agent_context` | Rules + skills (+ optional profile snapshot) for prompts |

Chat equivalents: `/analyze profile`, `/gaps`, `/growth`, `/trending`, `/follow`, `/improve`, `/export`.

---

## 2. External server — `github` (git-mentor-github-mcp)

**Process:** `node @git-mentor/github/dist/mcp-github-server.js`  
**Env:** `GITHUB_PERSONAL_ACCESS_TOKEN` (from `gh auth token` or `GITHUB_TOKEN`)

Legacy installs using `npx @modelcontextprotocol/server-github` are migrated to this server on next `gitmentor` start.

### Tools shipped today

| Tool | Arguments | Chat shortcut | OAuth scope |
|------|-----------|---------------|-------------|
| `fork_repository` | `owner`, `repo`, optional `organization` | `/fork owner/repo` or `fork reponame` after `/trending` | `repo` (default gh auth) |
| `follow_user` | `username` | `/follow` then `/follow apply`, or `follow them` / `follow those profiles` | **`user`** (includes `user:follow`) — run **`/auth refresh`** if you get 404 |

**Follow workflow**

1. User runs `/follow` → list cached in `actionPlan.github.profiles`.
2. User says `follow them` or `/follow apply` → chat calls MCP `follow_user` for each username (not the LLM guessing names).
3. Deictic phrases (`those profiles`, `them`, `these`) resolve to the last `/follow` list.

**Fork workflow**

1. User runs `/trending` → repos stored in `actionPlan.github.repos`.
2. `/fork opencode` or `fork owner/repo` → MCP `fork_repository`.

Low-level invoke:

```text
/mcp call github fork_repository {"owner":"anomalyco","repo":"opencode"}
/mcp call github follow_user {"username":"karpathy"}
```

### Tools listed for roadmap (not in current server binary)

These appear in git-mentor docs/skills as **planned** MCP actions; use `/mcp tools github` to see what your running server actually exposes. They were available on the deprecated `server-github` package and may return “Unknown tool” until implemented:

| Tool | Typical use |
|------|-------------|
| `search_repositories` | `{ "query": "topic:mcp stars:>500" }` |
| `create_repository` | New repo under authenticated user |
| `create_issue` | `owner`, `repo`, `title`, `body`, … |
| `create_pull_request` | Open PR between branches |
| `push_files` | Multi-file commit |
| `create_branch` | Branch before push/PR |

For issues/PRs/search until those tools ship: prefer chat coaching + manual GitHub UI, or extend `mcp-github-server.ts`.

---

## 3. Rules for the agent

- **Fork / follow / issue / PR** → GitHub MCP (`github`), never “click Fork on github.com” when MCP is enabled.
- **Profile / gaps / trending list / role models list** → built-in `gitmentor mcp` or chat slash commands.
- After `/follow`, never ask the user to repeat usernames when they say **follow them** — use cached profiles.
- On follow 404 / scope errors, tell the user: **`/auth refresh`**, then retry.

---

## 4. Auth checklist

```bash
/auth login             # sign in from chat
/auth status            # token scopes
/auth refresh           # add user scope for follow_user
gitmentor auth login    # same from CLI
gitmentor auth refresh
```

Token is injected into the github MCP process as `GITHUB_PERSONAL_ACCESS_TOKEN`.
