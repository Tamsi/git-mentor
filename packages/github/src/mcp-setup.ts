import { execSync } from "node:child_process";
import type { GitMentorConfig } from "@git-mentor/core";
import { hasGitHubAuth } from "./auth.js";

export const GITHUB_MCP_SERVER_NAME = "github";

export const GITHUB_MCP_DEFAULT = {
  name: GITHUB_MCP_SERVER_NAME,
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  env: {
    GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}",
  },
  enabled: true,
} as const;

/** GitHub write actions (fork, issues, PRs) — delegate to GitHub MCP, not git-mentor core. */
export const GITHUB_MCP_ACTION_TOOLS = [
  "fork_repository",
  "create_repository",
  "create_issue",
  "create_pull_request",
  "push_files",
  "create_branch",
  "search_repositories",
] as const;

export function resolveGitHubTokenForMcp(config: GitMentorConfig): string | undefined {
  return (
    config.github.token ??
    process.env.GIT_MENTOR_GITHUB_TOKEN ??
    process.env.GITHUB_TOKEN ??
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN ??
    (config.github.useGhCli
      ? (() => {
          try {
            return execSync("gh auth token", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
          } catch {
            return undefined;
          }
        })()
      : undefined)
  );
}

export function isGitHubMcpEnabled(config: GitMentorConfig): boolean {
  return config.mcp.servers.some((server) => server.name === GITHUB_MCP_SERVER_NAME && server.enabled);
}

/** Register or enable the official GitHub MCP server when gh/token auth is available. */
export function ensureGitHubMcpServer(config: GitMentorConfig): boolean {
  if (!hasGitHubAuth(config)) return false;

  const existing = config.mcp.servers.find((server) => server.name === GITHUB_MCP_SERVER_NAME);
  if (!existing) {
    config.mcp.servers.push({
      ...GITHUB_MCP_DEFAULT,
      args: [...GITHUB_MCP_DEFAULT.args],
      env: { ...GITHUB_MCP_DEFAULT.env },
    });
    return true;
  }

  if (!existing.enabled) {
    existing.enabled = true;
    return true;
  }

  return false;
}
