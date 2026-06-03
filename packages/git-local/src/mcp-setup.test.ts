import { describe, expect, it } from "vitest";
import { GIT_LOCAL_MCP_SHIPPED_TOOLS } from "./mcp-handlers.js";

describe("git-local MCP setup", () => {
  it("ships expected tools", () => {
    expect([...GIT_LOCAL_MCP_SHIPPED_TOOLS]).toEqual([
      "git_clone",
      "git_pull",
      "git_status",
      "git_log",
      "git_branch_list",
      "git_diff_stat",
      "list_workspaces",
    ]);
  });
});
