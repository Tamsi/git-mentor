import { describe, expect, it } from "vitest";
import { GITHUB_MCP_SHIPPED_TOOLS, GITHUB_MCP_TOOL_DEFINITIONS } from "@git-mentor/github";
import { GITMENTOR_BUILTIN_MCP_TOOLS } from "@git-mentor/core";
import { buildMcpToolsReferenceMarkdown } from "./mcp-tools-reference.js";

describe("buildMcpToolsReferenceMarkdown", () => {
  it("documents every shipped GitHub MCP tool with a heading", () => {
    const md = buildMcpToolsReferenceMarkdown();
    for (const name of GITHUB_MCP_SHIPPED_TOOLS) {
      expect(md).toContain(`### \`${name}\``);
    }
    expect(GITHUB_MCP_TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual(
      [...GITHUB_MCP_SHIPPED_TOOLS].sort(),
    );
  });

  it("documents built-in and planned tools", () => {
    const md = buildMcpToolsReferenceMarkdown();
    for (const name of GITMENTOR_BUILTIN_MCP_TOOLS) {
      expect(md).toContain(`\`${name}\``);
    }
    expect(md).toContain("list_following");
    expect(md).toContain("list_followers");
    expect(md).toContain("/followers");
    expect(md).toContain("/discussions");
  });
});
