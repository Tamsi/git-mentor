# GitHub MCP actions

Delegate **GitHub write operations** to the **GitHub MCP server** (`github`) — never give manual “click Fork” instructions when MCP is enabled.

## When to use

- User asks to fork, create an issue, open a PR, push files, or search repos on GitHub.
- User says `fork <repo>` after `/trending` or mentions a repo from the growth plan.

## Workflow

1. Confirm GitHub MCP is enabled (`/mcp` lists `github`).
2. Resolve the repo:
   - Full name: `owner/repo`
   - Short name: match against last `/trending` results in profile data
3. Run the MCP tool (user can also type `/fork owner/repo`):
   - **Fork:** `fork_repository` with `{ "owner", "repo" }`
   - **Search:** `search_repositories` with `{ "query" }`
   - **Issue:** `create_issue` with repo + title/body
4. Return the MCP result URL and next OSS step (clone, branch, PR).

## Do not

- Explain how to click Fork on github.com when `/fork` or MCP can do it.
- Implement GitHub API calls outside MCP for actions the GitHub MCP already exposes.
