import { describe, expect, it } from "vitest";
import { GitMentorConfigSchema } from "@git-mentor/core";
import { ensureGitHubMcpServer, isGitHubMcpEnabled } from "./mcp-setup.js";

describe("ensureGitHubMcpServer", () => {
  it("adds github MCP server when auth is configured via token", () => {
    const config = GitMentorConfigSchema.parse({
      github: { token: "ghp_test", useGhCli: false },
    });
    expect(ensureGitHubMcpServer(config)).toBe(true);
    expect(isGitHubMcpEnabled(config)).toBe(true);
    expect(config.mcp.servers[0]?.name).toBe("github");
  });

  it("does nothing without auth", () => {
    const config = GitMentorConfigSchema.parse({ github: { useGhCli: false } });
    expect(ensureGitHubMcpServer(config)).toBe(false);
  });
});
