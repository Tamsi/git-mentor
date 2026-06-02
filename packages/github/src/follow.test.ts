import { describe, expect, it } from "vitest";
import { parseFollowUserMcpResult } from "./follow.js";

describe("parseFollowUserMcpResult", () => {
  it("parses JSON followed status from MCP follow_user", () => {
    const result = parseFollowUserMcpResult(
      JSON.stringify({ username: "karpathy", status: "followed" }),
      "karpathy",
    );
    expect(result).toEqual({ username: "karpathy", status: "followed" });
  });

  it("parses JSON already_following status", () => {
    const result = parseFollowUserMcpResult(
      JSON.stringify({ username: "simonw", status: "already_following" }),
      "simonw",
    );
    expect(result).toEqual({ username: "simonw", status: "already_following" });
  });

  it("treats non-JSON MCP errors as failed with the raw message", () => {
    const message =
      "Not Found\nGitHub may be rejecting this call due to missing OAuth scope. Run: `gh auth refresh -h github.com -s user`";
    const result = parseFollowUserMcpResult(message, "karpathy");
    expect(result.status).toBe("failed");
    expect(result.message).toContain("scope");
  });

  it("does not infer already_following from plain text", () => {
    const result = parseFollowUserMcpResult("User is already following this account", "karpathy");
    expect(result.status).toBe("failed");
    expect(result.message).toContain("already");
  });

  it("fails on empty response", () => {
    const result = parseFollowUserMcpResult("  ", "karpathy");
    expect(result.status).toBe("failed");
    expect(result.message).toContain("Empty");
  });
});
