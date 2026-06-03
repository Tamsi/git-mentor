import type { GitMentorConfig } from "@git-mentor/core";
import {
  callGitHubMcpTool,
  GITHUB_MCP_SERVER_NAME,
  GITHUB_MCP_SHIPPED_TOOLS,
  GitHubRestClient,
  GitHubWriteClient,
  isGitHubMcpEnabled,
  resolveGitHubTokenForMcp,
} from "@git-mentor/github";
import { callExternalMcpTool } from "./mcp-client.js";

const SHIPPED_GITHUB_TOOLS = new Set<string>(GITHUB_MCP_SHIPPED_TOOLS);

function githubMcpDisabledError(): Error {
  return new Error(
    "GitHub MCP is not enabled. Run **`gitmentor login`** or **`/auth login`**, then retry.",
  );
}

/** Format tool output for chat / Ollama (matches former MCP text responses). */
export function formatGithubToolResult(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function parseExternalMcpPayload(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return raw;
  }
}

/**
 * Run a shipped `github` MCP tool in-process when a token is available (fast path).
 * Falls back to stdio MCP only when the server is enabled but no token is resolvable.
 */
export async function invokeGithubTool(
  config: GitMentorConfig,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  if (!isGitHubMcpEnabled(config)) {
    throw githubMcpDisabledError();
  }
  if (!SHIPPED_GITHUB_TOOLS.has(name)) {
    throw new Error(`Unknown GitHub MCP tool: ${name}`);
  }

  const token = resolveGitHubTokenForMcp(config);
  if (token) {
    const rest = new GitHubRestClient(() => token);
    const write = new GitHubWriteClient(rest);
    return callGitHubMcpTool(name, args, { rest, write });
  }

  const raw = await callExternalMcpTool(config, GITHUB_MCP_SERVER_NAME, name, args);
  return parseExternalMcpPayload(raw);
}
