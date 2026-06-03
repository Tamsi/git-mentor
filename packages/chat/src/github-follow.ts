import type { GitMentorConfig } from "@git-mentor/core";
import { assertCanFollowUsers, hasGitHubAuth, isGitHubMcpEnabled } from "@git-mentor/github";
import { followProfilesViaGitHubMcp, formatFollowResultsMarkdown } from "./github-mcp.js";
import { formatToolResult } from "./prompts.js";
import type { ChatReply, ProgressCallback } from "./types.js";

import { stripAtUsername } from "./command-utils.js";

export const stripGitHubUsername = stripAtUsername;

export async function runFollowProfilesOnGitHub(options: {
  config: GitMentorConfig;
  usernames: string[];
  onProgress?: ProgressCallback;
}): Promise<ChatReply> {
  if (!hasGitHubAuth(options.config)) {
    return {
      content: "GitHub auth required. Run **`/auth login`** or `gitmentor auth login`.",
      toolUsed: "follow-apply",
    };
  }

  if (!isGitHubMcpEnabled(options.config)) {
    return {
      content:
        "GitHub MCP is not enabled. Run **`/auth login`** so the `github` MCP server is registered.",
      toolUsed: "follow-apply",
    };
  }

  const targets = [...new Set(options.usernames.map(stripGitHubUsername).filter(Boolean))];
  if (targets.length === 0) {
    return {
      content: formatToolResult(
        "No profiles to follow",
        "Run **`/follow`** first, then **`/follow apply`**. Or ask in chat (with GitHub tools) to follow specific users via `follow_user`.",
      ),
      toolUsed: "follow-apply",
    };
  }

  try {
    await assertCanFollowUsers(options.config);
    const results = await followProfilesViaGitHubMcp(options.config, targets, options.onProgress);
    const failed = results.filter((r) => r.status === "failed");
    const body =
      formatFollowResultsMarkdown(results) +
      (failed.length === results.length
        ? "\n\n_Refresh OAuth scopes:_ **`/auth refresh`**"
        : "");
    return {
      content: formatToolResult("Following on GitHub (GitHub MCP)", body),
      toolUsed: "follow-apply",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: formatToolResult(
        "Could not follow profiles via GitHub MCP",
        `${message}\n\nRun: /auth refresh`,
      ),
      toolUsed: "follow-apply",
    };
  }
}
