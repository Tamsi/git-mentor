import { execSync } from "node:child_process";
import type { GitMentorConfig } from "@git-mentor/core";
import { hasGitHubAuth } from "./auth.js";
import { githubMcpServerScriptPath } from "./mcp-path.js";

export const GITHUB_MCP_SERVER_NAME = "github";

export function buildGithubMcpServerEntry() {
  return {
    name: GITHUB_MCP_SERVER_NAME,
    command: process.execPath,
    args: [githubMcpServerScriptPath()],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}",
    },
    enabled: true,
  };
}

/** @deprecated use buildGithubMcpServerEntry() */
export const GITHUB_MCP_DEFAULT = buildGithubMcpServerEntry();

/** Tools implemented by `mcp-github-server.ts` — use `/mcp tools github` to verify at runtime. */
export const GITHUB_MCP_SHIPPED_TOOLS = ["fork_repository", "follow_user"] as const;

/** Roadmap only — not exposed by git-mentor-github-mcp yet (see mcp/tools.md). */
export const GITHUB_MCP_PLANNED_TOOLS = [
  "search_repositories",
  "create_repository",
  "create_issue",
  "create_pull_request",
  "push_files",
  "create_branch",
] as const;

/** @deprecated Use {@link GITHUB_MCP_SHIPPED_TOOLS} — kept for older imports. */
export const GITHUB_MCP_ACTION_TOOLS = GITHUB_MCP_SHIPPED_TOOLS;

const LEGACY_GITHUB_MCP_NPX = "@modelcontextprotocol/server-github";

export function usesLegacyGithubMcpServer(server: GitMentorConfig["mcp"]["servers"][number]): boolean {
  return (
    server.name === GITHUB_MCP_SERVER_NAME &&
    server.command === "npx" &&
    server.args.some((arg) => arg.includes(LEGACY_GITHUB_MCP_NPX))
  );
}

export function migrateGithubMcpServerIfLegacy(server: GitMentorConfig["mcp"]["servers"][number]): boolean {
  if (!usesLegacyGithubMcpServer(server)) return false;
  const entry = buildGithubMcpServerEntry();
  server.command = entry.command;
  server.args = [...entry.args];
  server.env = { ...entry.env, ...server.env };
  return true;
}

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
    const entry = buildGithubMcpServerEntry();
    config.mcp.servers.push({
      ...entry,
      args: [...entry.args],
      env: { ...entry.env },
    });
    return true;
  }

  if (migrateGithubMcpServerIfLegacy(existing)) {
    return true;
  }

  if (!existing.enabled) {
    existing.enabled = true;
    return true;
  }

  return false;
}
