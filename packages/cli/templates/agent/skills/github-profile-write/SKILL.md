# GitHub profile write (MCP)

Apply coaching suggestions to the user's real GitHub account.

## When to use

- User asks to update bio, profile README, repo README, pins, or repo description.
- After `/improve` when the user wants changes applied, not only suggested.

## Workflow

1. Confirm the session user matches **`gh auth`** (writes fail for other usernames).
2. Propose the final text (bio or README markdown) in chat; ask for explicit approval.
3. Apply via:
   - `/apply bio <text>`
   - `/apply readme <markdown>` (profile repo `user/user`)
   - `/apply readme owner/repo <markdown>`
   - `/apply pin owner/repo …` (max 6)
   - Or `/mcp call github update_user_profile {"bio":"…"}`
   - Or `/mcp call github upsert_repository_file {…}`
4. Tell the user to run **`/analyze profile`** after writes to refresh evidence.

## Do not

- Invent success without tool output.
- Write to repos the user does not own without clear permission.
