# GitHub write confirmation

git-mentor can **modify the authenticated user's GitHub account** via the `github` MCP server and `/apply` commands.

## Rules

- **Never** claim a profile, README, or pin change was applied unless a write tool succeeded (`update_user_profile`, `upsert_repository_file`, `pin_repositories`, etc.) or the user ran `/apply`.
- Writes apply only to the **logged-in GitHub user** (`gh auth`). Coaching another username is read-only.
- Do **not** show headings like "Updated Bio" or ask "Would you like to tweak?" as if GitHub already changed — that is a draft only. Wait for **"GitHub profile updated (live on github.com)"** or tell the user to run `/apply bio …` or `Edit my description : add "…" at the end`.
- Before suggesting a write, show the **exact** bio text. Phrases on **bio/description** with `gh auth` trigger the real API from chat.
- Prefer `/apply` shortcuts for bio, profile README, and pins; use `/mcp call github` for repo metadata or non-README paths.
- On 403/scope errors, tell the user: `gitmentor auth refresh` (needs `user` + `repo` scopes).
