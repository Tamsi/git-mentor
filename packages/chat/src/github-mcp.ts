import type { GitMentorConfig, TrendingRepo } from "@git-mentor/core";
import { loadMcpToolsDoc } from "@git-mentor/core";
import {
  GITHUB_MCP_SERVER_NAME,
  GITHUB_MCP_SHIPPED_TOOLS,
  formatFollowResultsMarkdown,
  formatFollowingListMarkdown,
  formatFollowersListMarkdown,
  formatDiscussionsListMarkdown,
  formatMyDiscussionsMarkdown,
  isGitHubMcpEnabled,
  type ListFollowersResult,
  parseFollowUserMcpResult,
  type FollowUserResult,
  type ListFollowingResult,
} from "@git-mentor/github";
import { stripAtUsername } from "./command-utils.js";
import { callExternalMcpTool } from "./mcp-client.js";

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

export async function listFollowingViaGitHubMcp(
  config: GitMentorConfig,
  username?: string,
): Promise<ListFollowingResult> {
  if (!isGitHubMcpEnabled(config)) {
    throw new Error(
      "GitHub MCP is not enabled. Run **`gitmentor login`** or **`/auth login`**, then retry.",
    );
  }

  const raw = await callExternalMcpTool(config, GITHUB_MCP_SERVER_NAME, "list_following", {
    ...(username ? { username: stripAtUsername(username) } : {}),
  });
  if (typeof raw === "string") {
    return JSON.parse(raw) as ListFollowingResult;
  }
  return raw as ListFollowingResult;
}

export async function listFollowersViaGitHubMcp(
  config: GitMentorConfig,
  username?: string,
): Promise<ListFollowersResult> {
  if (!isGitHubMcpEnabled(config)) {
    throw new Error(
      "GitHub MCP is not enabled. Run **`gitmentor login`** or **`/auth login`**, then retry.",
    );
  }

  const raw = await callExternalMcpTool(config, GITHUB_MCP_SERVER_NAME, "list_followers", {
    ...(username ? { username: stripAtUsername(username) } : {}),
  });
  if (typeof raw === "string") {
    return JSON.parse(raw) as ListFollowersResult;
  }
  return raw as ListFollowersResult;
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

type ListDiscussionsMcpResult = {
  owner: string;
  repo: string;
  discussions: Array<{
    number: number;
    title: string;
    url: string;
    category?: string;
    author?: string;
    updatedAt?: string;
  }>;
};

type ListMyDiscussionsMcpResult = {
  username: string;
  reposScanned: number;
  discussions: Array<{
    number: number;
    title: string;
    url: string;
    owner: string;
    repo: string;
    category?: string;
    updatedAt?: string;
  }>;
};

function parseMcpJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export async function listDiscussionsRepoMarkdown(
  config: GitMentorConfig,
  owner: string,
  repo: string,
  first = 15,
): Promise<string> {
  if (!isGitHubMcpEnabled(config)) {
    throw new Error(
      "GitHub MCP is not enabled. Run **`gitmentor login`** or **`/auth login`**, then retry.",
    );
  }
  const raw = await callExternalMcpTool(config, GITHUB_MCP_SERVER_NAME, "list_discussions", {
    owner,
    repo,
    first,
  });
  return formatDiscussionsListMarkdown(parseMcpJson<ListDiscussionsMcpResult>(raw));
}

export async function listMyDiscussionsMarkdown(
  config: GitMentorConfig,
  username: string,
): Promise<string> {
  if (!isGitHubMcpEnabled(config)) {
    throw new Error(
      "GitHub MCP is not enabled. Run **`gitmentor login`** or **`/auth login`**, then retry.",
    );
  }
  const raw = await callExternalMcpTool(config, GITHUB_MCP_SERVER_NAME, "list_my_discussions", {
    username,
    max_repos: 10,
    per_repo: 5,
  });
  return formatMyDiscussionsMarkdown(parseMcpJson<ListMyDiscussionsMcpResult>(raw));
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
  if (!isGitHubMcpEnabled(config)) {
    throw new Error(
      "GitHub MCP is not enabled. Run **`/auth login`** or enable the github server in config.yaml.",
    );
  }

  const raw = await callExternalMcpTool(config, GITHUB_MCP_SERVER_NAME, "follow_user", {
    username: stripAtUsername(username),
  });
  return parseFollowUserMcpResult(raw, stripAtUsername(username));
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
    "Use MCP for profile/repo reads and writes: `list_followers`, `list_following`, `get_user`, discussions tools, etc. Slash: `/followers`, `/following`, `/discussions`, `/fork`, `/apply`.",
    "Scopes: **`/auth refresh`** if follow_user returns 404.",
    ...toolsSection,
    "=== END GITHUB MCP ===",
  ].join("\n");
}
