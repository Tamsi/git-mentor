import { describe, expect, it } from "vitest";
import { GitMentorConfigSchema } from "@git-mentor/core";
import {
  ensureGitHubMcpServer,
  GITHUB_MCP_PLANNED_TOOLS,
  GITHUB_MCP_SHIPPED_TOOLS,
  isGitHubMcpEnabled,
  migrateGithubMcpServerIfLegacy,
  usesLegacyGithubMcpServer,
} from "./mcp-setup.js";

describe("GitHub MCP tool lists", () => {
  it("ships read, social, search, discussions, and profile write tools", () => {
    expect(GITHUB_MCP_SHIPPED_TOOLS).toContain("list_followers");
    expect(GITHUB_MCP_SHIPPED_TOOLS).toContain("list_following");
    expect(GITHUB_MCP_SHIPPED_TOOLS).toContain("list_discussions");
    expect(GITHUB_MCP_SHIPPED_TOOLS).toContain("create_discussion");
    expect(GITHUB_MCP_SHIPPED_TOOLS).toContain("fork_repository");
    expect(GITHUB_MCP_PLANNED_TOOLS).toHaveLength(0);
  });
});

describe("ensureGitHubMcpServer", () => {
  it("adds github MCP server when auth is configured via token", () => {
    const config = GitMentorConfigSchema.parse({
      github: { token: "ghp_test", useGhCli: false },
    });
    expect(ensureGitHubMcpServer(config)).toBe(true);
    expect(isGitHubMcpEnabled(config)).toBe(true);
    expect(config.mcp.servers[0]?.name).toBe("github");
    expect(config.mcp.servers[0]?.args[0]).toContain("mcp-github-server.js");
  });

  it("migrates legacy npx github MCP to git-mentor server", () => {
    const config = GitMentorConfigSchema.parse({
      github: { token: "ghp_test", useGhCli: false },
      mcp: {
        servers: [
          {
            name: "github",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            enabled: true,
          },
        ],
      },
    });
    const server = config.mcp.servers[0]!;
    expect(usesLegacyGithubMcpServer(server)).toBe(true);
    expect(migrateGithubMcpServerIfLegacy(server)).toBe(true);
    expect(server.args[0]).toContain("mcp-github-server.js");
  });

  it("does nothing without auth", () => {
    const config = GitMentorConfigSchema.parse({ github: { useGhCli: false } });
    expect(ensureGitHubMcpServer(config)).toBe(false);
  });
});
