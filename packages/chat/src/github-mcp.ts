import type { GitMentorConfig, TrendingRepo } from "@git-mentor/core";
import { loadMcpToolsDoc } from "@git-mentor/core";
import {
  GITHUB_MCP_SERVER_NAME,
  GITHUB_MCP_SHIPPED_TOOLS,
  formatFollowResultsMarkdown,
  isGitHubMcpEnabled,
  parseFollowUserMcpResult,
  type FollowUserResult,
} from "@git-mentor/github";
import { callExternalMcpTool } from "./mcp-client.js";

export function resolveForkTarget(
  input: string,
  trendingRepos: TrendingRepo[] = [],
): { owner: string; repo: string } | null {
  let cleaned = input.trim();
  cleaned = cleaned
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/, "");

  if (cleaned.includes("/")) {
    const [owner, repo] = cleaned.split("/").filter(Boolean);
    if (owner && repo) return { owner, repo };
  }

  const needle = cleaned.toLowerCase();
  for (const item of trendingRepos) {
    const [owner, repoName] = item.fullName.split("/");
    if (!owner || !repoName) continue;
    if (repoName.toLowerCase() === needle || item.fullName.toLowerCase() === needle) {
      return { owner, repo: repoName };
    }
  }

  return null;
}

export async function forkRepositoryViaGitHubMcp(
  config: GitMentorConfig,
  owner: string,
  repo: string,
): Promise<string> {
  if (!isGitHubMcpEnabled(config)) {
    throw new Error(
      "GitHub MCP is not enabled. Run **`/auth login`** or enable the github server in config.yaml.",
    );
  }

  return callExternalMcpTool(config, GITHUB_MCP_SERVER_NAME, "fork_repository", { owner, repo });
}

export async function followUserViaGitHubMcp(
  config: GitMentorConfig,
  username: string,
): Promise<FollowUserResult> {
  if (!isGitHubMcpEnabled(config)) {
    throw new Error(
      "GitHub MCP is not enabled. Run **`/auth login`** or enable the github server in config.yaml.",
    );
  }

  const raw = await callExternalMcpTool(config, GITHUB_MCP_SERVER_NAME, "follow_user", {
    username: username.replace(/^@/, ""),
  });
  return parseFollowUserMcpResult(raw, username.replace(/^@/, ""));
}

export async function followProfilesViaGitHubMcp(
  config: GitMentorConfig,
  usernames: string[],
  onProgress?: (message: string) => void,
): Promise<FollowUserResult[]> {
  const results: FollowUserResult[] = [];
  const unique = [...new Set(usernames.map((u) => u.replace(/^@/, "")))];

  for (const username of unique) {
    onProgress?.(`Following @${username} via GitHub MCP…`);
    try {
      results.push(await followUserViaGitHubMcp(config, username));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ username, status: "failed", message });
    }
  }

  return results;
}

export { formatFollowResultsMarkdown } from "@git-mentor/github";

export function formatGitHubMcpActionsHint(config: GitMentorConfig): string {
  if (!isGitHubMcpEnabled(config)) return "";

  const toolsDoc = loadMcpToolsDoc();
  const toolsSection = toolsDoc
    ? ["", "=== MCP TOOLS REFERENCE ===", toolsDoc, "=== END MCP TOOLS REFERENCE ==="]
    : [];

  const shipped = GITHUB_MCP_SHIPPED_TOOLS.map((t) => `\`${t}\``).join(", ");

  return [
    "=== GITHUB MCP (write actions) ===",
    `Shipped tools on server \`github\`: ${shipped}.`,
    "Use this server for fork/follow — not manual GitHub UI steps or direct API from chat.",
    "Shortcuts: `/fork owner/repo` · `/follow` then `/follow apply` or `follow them`.",
    "Scopes: **`/auth refresh`** if follow_user returns 404.",
    ...toolsSection,
    "=== END GITHUB MCP ===",
  ].join("\n");
}
