import type { GitMentorConfig, TrendingRepo } from "@git-mentor/core";
import { GITHUB_MCP_SERVER_NAME, isGitHubMcpEnabled } from "@git-mentor/github";
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
      "GitHub MCP is not enabled. Run `gh auth login` and restart gitmentor, or enable the github server in config.yaml.",
    );
  }

  return callExternalMcpTool(config, GITHUB_MCP_SERVER_NAME, "fork_repository", { owner, repo });
}

export function formatGitHubMcpActionsHint(config: GitMentorConfig): string {
  if (!isGitHubMcpEnabled(config)) return "";

  return [
    "=== GITHUB MCP (write actions) ===",
    "For fork, issues, PRs, and repo search, use the GitHub MCP server — not manual GitHub UI steps.",
    "Chat: `/fork owner/repo` or `/fork reponame` (after `/trending`).",
    "Low-level: `/mcp call github fork_repository {\"owner\":\"...\",\"repo\":\"...\"}`",
    "=== END GITHUB MCP ===",
  ].join("\n");
}
