# GitHub MCP actions

Delegate **GitHub write operations** to the **GitHub MCP server** (`github`). Full tool list: `~/.config/git-mentor/mcp/tools.md` (also injected in prompts when present).

## When to use

- User asks to fork a repo or follow GitHub users (shipped MCP tools).
- For issues, PRs, or repo search: coach manually until those tools ship (see **planned** in `mcp/tools.md`).
- User says `fork <repo>` after `/trending` or mentions a repo from the growth plan.
- User says `follow them` / `follow those profiles` after `/follow`, or runs `/follow apply`.

## Workflow

1. Confirm GitHub MCP is enabled (`/mcp` lists `github`).
2. Read **shipped tools** in `mcp/tools.md` — today: `fork_repository`, `follow_user`.
3. Resolve the repo or usernames (see tools.md workflows).
4. Run the GitHub MCP tool (or chat shortcut):
   - **Fork:** `fork_repository` with `{ "owner", "repo" }` — or `/fork owner/repo`
   - **Follow:** `follow_user` with `{ "username" }` — or `/follow apply` / `follow them` after `/follow`
5. If `follow_user` fails with scope errors: `/auth refresh` or `gitmentor auth refresh`
6. Return the MCP result and next OSS step (clone, branch, PR).

## Do not

- Explain how to click Fork on github.com when `/fork` or MCP can do it.
- Ask the user to list usernames after `/follow` when they said `follow them` — use cached profiles from `/follow`.
- Implement GitHub API calls outside MCP for actions the GitHub MCP already exposes.
