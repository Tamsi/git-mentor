import type { GitMentorConfig } from "@git-mentor/core";
import { isGitInstalled } from "./git-runner.js";
import { gitLocalMcpServerScriptPath } from "./mcp-path.js";

export const GIT_LOCAL_MCP_SERVER_NAME = "git-local";

export function buildGitLocalMcpServerEntry() {
  return {
    name: GIT_LOCAL_MCP_SERVER_NAME,
    command: process.execPath,
    args: [gitLocalMcpServerScriptPath()],
    env: {} as Record<string, string>,
    enabled: true,
  };
}

export function isGitLocalMcpEnabled(config: GitMentorConfig): boolean {
  return config.mcp.servers.some(
    (server) => server.name === GIT_LOCAL_MCP_SERVER_NAME && server.enabled,
  );
}

/** Register git-local MCP when `git` is on PATH. */
export function ensureGitLocalMcpServer(config: GitMentorConfig): boolean {
  if (!isGitInstalled()) return false;

  const existing = config.mcp.servers.find((server) => server.name === GIT_LOCAL_MCP_SERVER_NAME);
  if (!existing) {
    const entry = buildGitLocalMcpServerEntry();
    config.mcp.servers.push({
      ...entry,
      args: [...entry.args],
      env: { ...entry.env },
    });
    return true;
  }

  if (!existing.enabled) {
    existing.enabled = true;
    return true;
  }

  const scriptPath = gitLocalMcpServerScriptPath();
  if (existing.args[0] !== scriptPath) {
    existing.args = [scriptPath];
    return true;
  }

  return false;
}
