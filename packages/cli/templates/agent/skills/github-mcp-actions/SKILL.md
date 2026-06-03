# GitHub MCP actions

Delegate **GitHub write operations** to the **GitHub MCP server** (`github`). Full catalog: `~/.config/git-mentor/mcp/tools.md` (regenerated on every `gitmentor init` from shipped tool definitions; injected in system prompts up to ~12k chars).

## When to use

- User asks to change bio, README, pins, fork, or follow — call the matching MCP tool (no manual GitHub UI steps).
- User runs `/follow apply` after `/follow` (slash command uses cached profile list).
- User runs `/fork owner/repo` after `/trending`.

## Workflow

1. Confirm GitHub MCP is enabled (`/mcp` lists `github`).
2. Read shipped tools in `mcp/tools.md` (`list_following`, `follow_user`, `fork_repository`, `update_user_profile`, `upsert_repository_file`, `pin_repositories`, …).
3. In **free-form chat** (Ollama + auth on own profile), invoke tools via the model tool loop — do not pretend a write succeeded without tool output.
4. Slash shortcuts still work: `/apply bio …`, `/fork owner/repo`, `/follow apply`.
5. On scope errors: `/auth refresh` or `gitmentor auth refresh`.

## Do not

- Claim bio/README/pin changes without a successful tool result.
- Explain how to click through the GitHub website when MCP can perform the action.
- Parse user intent with custom phrase matching — rely on tools + slash commands.
