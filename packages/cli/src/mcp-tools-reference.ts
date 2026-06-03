import path from "node:path";
import {
  GITHUB_MCP_SHIPPED_TOOLS,
  GITHUB_MCP_TOOL_DEFINITIONS,
} from "@git-mentor/github";
import { GITMENTOR_BUILTIN_MCP_TOOLS } from "@git-mentor/core";

const HEADER = `# git-mentor — MCP & GitHub tools reference (for the coaching model)

This file is the **authoritative catalog** of what you can do in git-mentor chat.
Path after \`gitmentor init\`: \`~/.config/git-mentor/mcp/tools.md\`
Regenerated on each \`gitmentor init\` from shipped server code.

## How you act in chat (Ollama tool calling)

When the user coaches **their own** GitHub account (\`gh auth\` / \`gitmentor login gh\` matches session @username):

1. **Call MCP tools on server \`github\`** directly (see §2) — do not claim a write or follow succeeded without a tool result.
2. **Slash commands** (§3) run deterministic handlers; prefer tools for writes the user confirms in natural language.
3. **Built-in \`gitmentor mcp\` tools** (§1) are **not** in your Ollama tool list — use slash commands or tell the user to run them.
4. Coaching **another** @username is **read-only** on GitHub (no \`github\` MCP writes).
5. **Followers vs following:** \`list_followers\` = who follows you; \`list_following\` = who you follow — never confuse them.

Auth: \`gitmentor login\` · \`/login\` · \`/auth status\` · \`/auth refresh\` if \`follow_user\` returns 404.

---

`;

function renderJsonSchemaProperties(schema: {
  type?: string;
  properties?: Record<string, { type?: string; description?: string; items?: { type?: string } }>;
  required?: string[];
}): string {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const lines: string[] = [];
  for (const [key, meta] of Object.entries(props)) {
    const req = required.has(key) ? " **required**" : " optional";
    const desc = meta.description ? ` — ${meta.description}` : "";
    const type =
      meta.type === "array" && meta.items
        ? `array<${meta.items.type ?? "string"}>`
        : (meta.type ?? "string");
    lines.push(`  - \`${key}\` (${type})${req}${desc}`);
  }
  return lines.length > 0 ? lines.join("\n") : "  - (no parameters)";
}

function renderGithubShippedTools(): string {
  const lines = [
    "## 2. GitHub MCP server (`github`) — tools you can call in chat",
    "",
    "Server process: \`node @git-mentor/github/dist/mcp-github-server.js\`",
    "Token env: \`GITHUB_PERSONAL_ACCESS_TOKEN\` (from \`gh auth token\`)",
    "",
    `**Shipped today (${GITHUB_MCP_SHIPPED_TOOLS.length} tools):** ${GITHUB_MCP_SHIPPED_TOOLS.map((t) => `\`${t}\``).join(", ")}`,
    "",
    "Invoke from chat: model tool call, or \`/mcp call github <tool> {json}\`.",
    "",
  ];

  for (const tool of GITHUB_MCP_TOOL_DEFINITIONS) {
    lines.push(`### \`${tool.name}\``, "", tool.description, "", "**Arguments:**");
    lines.push(renderJsonSchemaProperties(tool.inputSchema as Parameters<typeof renderJsonSchemaProperties>[0]));
    lines.push("");
  }

  lines.push(
    "### GitHub REST / `gh` equivalents (not separate MCP tools)",
    "",
    "| Goal | API / gh | MCP tool to use |",
    "|------|----------|-----------------|",
    "| List who I follow | `GET /user/following` | **`list_following`** |",
    "| List my followers | `GET /user/followers` | **`list_followers`** |",
    "| Follow / unfollow | `PUT` / `DELETE` following | **`follow_user`** / **`unfollow_user`** |",
    "| Fork a repo | `POST /repos/{o}/{r}/forks` | **`fork_repository`** |",
    "| Edit bio | `PATCH /user` | **`update_user_profile`** |",
    "| Commit a file | Contents API | **`upsert_repository_file`** |",
    "| Repo description | `PATCH /repos/{o}/{r}` | **`update_repository_metadata`** |",
    "| Profile pins | GraphQL | **`pin_repositories`** |",
    "",
    "### OAuth scopes (typical)",
    "",
    "- **`user`** — profile bio, **`list_following`**, includes **`user:follow`** for **`follow_user`**",
    "- **`repo`** — files, repo metadata, forks",
    "- Run **`/auth refresh`** or \`gitmentor auth refresh\` if a tool returns 404 / insufficient scope",
    "",
    "Issues, PRs, and local git clone are **out of scope** for git-mentor.",
    "",
  );

  return lines.join("\n");
}

function renderBuiltinTools(): string {
  return [
    "## 1. Built-in server (`gitmentor mcp`) — coaching & analysis",
    "",
    "Start with: `gitmentor mcp` (stdio). **Not** exposed as Ollama tools in chat — use slash commands.",
    "",
    "| Tool | Arguments | Purpose |",
    "|------|-----------|---------|",
    "| `analyze_profile` | `username`, `role` (default ai-engineer) | Full career dossier (repos, languages, attractiveness) |",
    "| `compare_role` | `username`, `role` | Gap analysis JSON vs target role |",
    "| `get_recommendations` | `username`, `role` | Growth / action plan JSON |",
    "| `discover_trending_repos` | `username`, `role`, `limit` (1–15) | Trending repos for stack + role |",
    "| `discover_profiles_to_follow` | `username`, `role`, `limit` | Suggested role models (not your live following list) |",
    "| `improve_profile` | `username`, `role` | Actionable profile improvement plan |",
    "| `analyze_repository` | `owner`, `repo` | Deep repo scan (manifests, deps) |",
    "| `analyze_repository_for_user` | `username`, `repo` | Repo scan with owner shorthand |",
    "| `list_target_roles` | — | Career role ids |",
    "| `list_rules` | — | Loaded coaching rules |",
    "| `list_skills` | — | Loaded coaching skills |",
    "| `get_agent_context` | optional `username`, `role` | Rules + skills (+ profile) for prompts |",
    "",
    `Full list: ${GITMENTOR_BUILTIN_MCP_TOOLS.map((t) => `\`${t}\``).join(", ")}`,
    "",
  ].join("\n");
}

function renderSlashCommands(): string {
  return [
    "## 3. Chat slash commands (no MCP call needed)",
    "",
    "### Analysis & coaching",
    "- `/analyze profile` — refresh profile dossier (bio, README, pins, stats)",
    "- `/analyze profile @user` — analyze another user (read-only writes)",
    "- `/analyze <repo>` or `/analyze owner/repo` — deep repository scan",
    "- `/gaps` — gap analysis vs `/role`",
    "- `/growth` — growth recommendations",
    "- `/improve` — profile improvement plan",
    "- `/export` — save dossier markdown",
    "- `/role <id>` — set target role",
    "",
    "### GitHub social & repos",
    "- `/following` — **live** list of accounts you follow (`list_following` via MCP)",
    "- `/follow` — suggested role models from coaching cache",
    "- `/follow apply` — MCP `follow_user` for cached suggestions",
    "- `/follow apply user1 user2` — follow explicit usernames",
    "- `/trending` — trending repos for your stack",
    "- `/followers` · `/following` — live social lists",
    "- `/discussions` · `/discussions owner/repo` · `/discussions community`",
    "- `/discuss create` · `/discuss reply` — forum posts (confirm with user)",
    "- `/fork owner/repo` — MCP `fork_repository`",
    "",
    "### Apply writes (same as MCP github tools)",
    "- `/apply bio <text>` → `update_user_profile`",
    "- `/apply readme <markdown>` → `upsert_repository_file` on profile repo",
    "- `/apply readme owner/repo <markdown>`",
    "- `/apply pin repo1 repo2 …` (max 6) → `pin_repositories`",
    "",
    "### Auth, model, MCP meta",
    "- `/login` — GitHub + Ollama sign-in",
    "- `/login gh` · `/login ollama`",
    "- `/auth` · `/auth login` · `/auth refresh` · `/auth status`",
    "- `/model` — pick Ollama model · `/model list` · `/model <name>`",
    "- `/mcp` — list servers",
    "- `/mcp tools github` — live tool list from server",
    "- `/mcp call github <tool> <json>` — manual MCP invoke",
    "",
    "### Agent config",
    "- `/rules` · `/skills` · `/help` · `/quit`",
    "",
  ].join("\n");
}

function renderGhCliReference(): string {
  return [
    "## 5. GitHub CLI (`gh`) — manual fallback (not MCP tools)",
    "",
    "Use when MCP is disabled, scopes are missing, or the user prefers the terminal.",
    "Token: same as MCP (`gh auth token`).",
    "",
    "| Intent | Command |",
    "|--------|---------|",
    "| Auth status / scopes | `gh auth status` |",
    "| Refresh scopes (follow) | `gh auth refresh -s user,repo` |",
    "| Who am I | `gh api user -q .login` |",
    "| List following | `gh api user/following --paginate` |",
    "| Follow user | `gh api -X PUT user/following/USERNAME` |",
    "| Fork repo | `gh repo fork OWNER/REPO` |",
    "| Edit bio (PATCH user) | `gh api -X PATCH user -f bio='…'` |",
    "| View repo | `gh repo view OWNER/REPO` |",
    "| Create issue | `gh issue create -R OWNER/REPO -t \"title\" -b \"body\"` |",
    "| Create PR | `gh pr create -R OWNER/REPO --title \"…\" --body \"…\"` |",
    "| Search repos | `gh search repos \"query\" --limit 10` |",
    "",
    "Chat mirrors: `/auth status`, `/following`, `/fork`, `/apply bio`.",
    "",
  ].join("\n");
}

function renderDecisionMatrix(): string {
  return [
    "## 4. Decision matrix (what to use when)",
    "",
    "| User intent | Action |",
    "|-------------|--------|",
    "| \"Who follows me?\" | **`list_followers`** or `/followers` — NOT `list_following` |",
    "| \"Who do I follow?\" | **`list_following`** or `/following` |",
    "| \"Forum / Community\" | **`list_discussions`** on `community/community` or `/discussions community` |",
    "| \"Threads on my repo\" | **`list_discussions`** or `/discussions owner/repo` |",
    "| \"Follow @x\" | **`follow_user`** |",
    "| \"Fork this repo\" | **`fork_repository`** or `/fork` |",
    "| \"Update my bio\" | **`update_user_profile`** or `/apply bio` |",
    "| \"Update my profile README\" | **`upsert_repository_file`** on `user/user` or `/apply readme` |",
    "| \"Pin repos on my profile\" | **`pin_repositories`** or `/apply pin` |",
    "| \"Analyze my career profile\" | `/analyze profile` (not MCP) |",
    "| \"What should I learn?\" | `/gaps` or `/growth` |",
    "| \"Trending repos for me\" | `/trending` |",
    "| \"Role models to study\" | `/follow` then optionally `/follow apply` |",
    "",
  ].join("\n");
}

function renderPostWriteAndCli(): string {
  return [
    "## 6. After writes",
    "",
    "Always suggest **`/analyze profile`** to refresh the coaching dossier after bio/README/pin changes.",
    "",
    "## 7. git-mentor CLI equivalents",
    "",
    "```bash",
    "gitmentor login              # GitHub + Ollama",
    "gitmentor login gh           # GitHub only",
    "gitmentor auth refresh       # add scopes",
    "gitmentor init               # refresh this tools.md from code",
    "gitmentor mcp                # built-in MCP server",
    "gh auth status",
    "gh api user/following --paginate",
    "```",
    "",
  ].join("\n");
}

/** Full MCP tools reference markdown for ~/.config/git-mentor/mcp/tools.md */
export function buildMcpToolsReferenceMarkdown(): string {
  return [
    HEADER,
    renderBuiltinTools(),
    "",
    renderGithubShippedTools(),
    "",
    renderSlashCommands(),
    "",
    renderDecisionMatrix(),
    "",
    renderGhCliReference(),
    "",
    renderPostWriteAndCli(),
  ].join("\n");
}

export function writeMcpToolsReference(targetPath: string, fs: typeof import("node:fs")): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, buildMcpToolsReferenceMarkdown());
}
