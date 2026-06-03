# GitHub account write — design

## Problem

gitmentor coached users but could not apply changes (bio, README, pins). Users expected “edit my profile” to commit on GitHub.

## Solution

Dedicated **write plane** in `@git-mentor/github`, exposed via:

1. **MCP server** `mcp-github-server.ts` (stdio, token from `gh`)
2. **Chat** `/apply` shortcuts with account guard
3. **Rules/skills** requiring confirmation before writes

## Security model

| Rule | Implementation |
|------|----------------|
| Token never in LLM context | MCP subprocess env only |
| Writes only for auth user | `resolveAuthenticatedUsername` vs session username |
| Human confirm | Rule `github-write-confirm`; `/apply` is explicit |
| Scopes | `user` + `repo` via `gh auth refresh` |

## APIs

- `PATCH /user` — profile fields  
- `PUT /repos/{o}/{r}/contents/{path}` — README / files (base64)  
- `PATCH /repos/{o}/{r}` — description, homepage, flags  
- GraphQL `replacePinnedItems` — up to 6 pins  

## Not in v0.2

- Org-owned repos without permission  
- Creating profile repo if absent (`create_repository` — Phase 1 remainder)  
- Email change (separate GitHub flow)  
- Discussions (Phase 2)  

## References

- `packages/github/src/github-write.ts`
- `packages/cli/templates/agent/mcp/tools.md`
