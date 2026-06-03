import { describe, expect, it } from "vitest";
import { formatGithubToolResult } from "./github-tool-bridge.js";

describe("formatGithubToolResult", () => {
  it("returns strings unchanged", () => {
    expect(formatGithubToolResult("ok")).toBe("ok");
  });

  it("pretty-prints objects", () => {
    const out = formatGithubToolResult({ login: "octocat" });
    expect(out).toContain('"login"');
    expect(out).toContain("octocat");
  });
});
