import type { GitMentorConfig, ProfileToFollow } from "@git-mentor/core";
import { assertCanFollowUsers, hasGitHubAuth, isGitHubMcpEnabled } from "@git-mentor/github";
import { followProfilesViaGitHubMcp, formatFollowResultsMarkdown } from "./github-mcp.js";
import { formatToolResult } from "./prompts.js";
import type { ChatReply, ProgressCallback } from "./types.js";

const DEICTIC_FOLLOW =
  /^follow\s+(those|these|them|all)(\s+(profiles?|users?|people|accounts?))?\s*(on\s+github)?[.!?\s]*$/i;

const RESERVED = new Set([
  "follow",
  "those",
  "these",
  "them",
  "all",
  "profiles",
  "profile",
  "users",
  "user",
  "people",
  "accounts",
  "account",
  "on",
  "github",
  "apply",
  "and",
  "or",
]);

export function isFollowActionIntent(input: string): boolean {
  const trimmed = input.trim();
  if (!/^follow\b/i.test(trimmed)) return false;
  if (/^follow\s+(up|best\s+practices|for\s+updates)/i.test(trimmed)) return false;
  return true;
}

export function resolveFollowTargets(input: string, cached: ProfileToFollow[]): string[] {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  if (
    !trimmed ||
    lower === "follow" ||
    lower === "follow apply" ||
    lower === "follow all" ||
    DEICTIC_FOLLOW.test(trimmed)
  ) {
    return cached.map((profile) => profile.username);
  }

  const match = trimmed.match(/^follow\s+(.+)$/i);
  if (!match?.[1]) return cached.map((profile) => profile.username);

  const rest = match[1];
  if (DEICTIC_FOLLOW.test(trimmed)) {
    return cached.map((profile) => profile.username);
  }

  const explicit: string[] = [];
  for (const token of rest.matchAll(/@?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37})?)/g)) {
    const username = token[1];
    if (!username || RESERVED.has(username.toLowerCase())) continue;
    explicit.push(username);
  }

  return explicit.length > 0 ? explicit : cached.map((profile) => profile.username);
}

export async function runFollowProfilesOnGitHub(options: {
  config: GitMentorConfig;
  input: string;
  cachedProfiles: ProfileToFollow[];
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

  const targets = resolveFollowTargets(options.input, options.cachedProfiles);
  if (targets.length === 0) {
    return {
      content: formatToolResult(
        "No profiles to follow",
        "Run **`/follow`** first to load role models, then **`/follow apply`** or say **`follow them`** / **`follow those profiles`**.",
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
