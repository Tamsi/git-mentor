import type { GitMentorConfig, TrendingRepo } from "@git-mentor/core";
import { loadMcpToolsDoc } from "@git-mentor/core";
import {
  GITHUB_MCP_SHIPPED_TOOLS,
  formatDiscussionsListMarkdown,
  formatFollowResultsMarkdown,
  formatFollowingListMarkdown,
  formatFollowersListMarkdown,
  isGitHubMcpEnabled,
  listDiscussions,
  parseFollowUserMcpResult,
  type FollowUserResult,
  type ListFollowersResult,
  type ListFollowingResult,
} from "@git-mentor/github";
import { stripAtUsername } from "./command-utils.js";
import { formatGithubToolResult, invokeGithubTool } from "./github-tool-bridge.js";

function stripGithubComUrl(value: string): string {
  const trimmed = value.trim();
  const https = "https://github.com/";
  const http = "http://github.com/";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith(https)) return trimmed.slice(https.length);
  if (lower.startsWith(http)) return trimmed.slice(http.length);
  return trimmed;
}

function stripGitAndTrailingSlash(value: string): string {
  let out = value.trim();
  if (out.endsWith(".git")) out = out.slice(0, -4);
  while (out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

export function resolveForkTarget(
  input: string,
  trendingRepos: TrendingRepo[] = [],
): { owner: string; repo: string } | null {
  let cleaned = stripGitAndTrailingSlash(stripGithubComUrl(input));

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

async function githubTool<T>(
  config: GitMentorConfig,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  return (await invokeGithubTool(config, name, args)) as T;
}

export async function forkRepositoryViaGitHubMcp(
  config: GitMentorConfig,
  owner: string,
  repo: string,
): Promise<string> {
  const result = await githubTool(config, "fork_repository", { owner, repo });
  return formatGithubToolResult(result);
}

export async function listFollowingViaGitHubMcp(
  config: GitMentorConfig,
  username?: string,
): Promise<ListFollowingResult> {
  return githubTool(config, "list_following", {
    ...(username ? { username: stripAtUsername(username) } : {}),
  });
}

export async function listFollowersViaGitHubMcp(
  config: GitMentorConfig,
  username?: string,
): Promise<ListFollowersResult> {
  return githubTool(config, "list_followers", {
    ...(username ? { username: stripAtUsername(username) } : {}),
  });
}

export function formatFollowersMcpMarkdown(result: ListFollowersResult | string): string {
  if (typeof result === "string") {
    try {
      return formatFollowersListMarkdown(JSON.parse(result) as ListFollowersResult);
    } catch {
      return result;
    }
  }
  return formatFollowersListMarkdown(result);
}

export async function listDiscussionsRepoMarkdown(
  config: GitMentorConfig,
  owner: string,
  repo: string,
  first = 15,
): Promise<string> {
  const data = await githubTool<Awaited<ReturnType<typeof listDiscussions>>>(
    config,
    "list_discussions",
    { owner, repo, first },
  );
  return formatDiscussionsListMarkdown(data);
}

export function formatFollowingMcpMarkdown(result: ListFollowingResult | string): string {
  if (typeof result === "string") {
    try {
      return formatFollowingListMarkdown(JSON.parse(result) as ListFollowingResult);
    } catch {
      return result;
    }
  }
  return formatFollowingListMarkdown(result);
}

export async function followUserViaGitHubMcp(
  config: GitMentorConfig,
  username: string,
): Promise<FollowUserResult> {
  const result = await githubTool(config, "follow_user", {
    username: stripAtUsername(username),
  });
  return parseFollowUserMcpResult(formatGithubToolResult(result), stripAtUsername(username));
}

export async function followProfilesViaGitHubMcp(
  config: GitMentorConfig,
  usernames: string[],
  onProgress?: (message: string) => void,
): Promise<FollowUserResult[]> {
  const results: FollowUserResult[] = [];
  const unique = [...new Set(usernames.map(stripAtUsername))];

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
    "When coaching your own profile (gh auth), the model can call these tools directly — do not claim writes without a tool result.",
    "Use MCP for profile/repo reads and writes: `list_followers`, `list_following`, `get_user`, `list_discussions`, `get_discussion`, `create_discussion`, etc. Slash: `/followers`, `/following`, `/discussions community|owner/repo`, `/discuss create|reply`, `/fork`, `/apply`.",
    "Scopes: **`/auth refresh`** if follow_user returns 404.",
    ...toolsSection,
    "=== END GITHUB MCP ===",
  ].join("\n");
}
