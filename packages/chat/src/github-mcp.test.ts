import { describe, expect, it } from "vitest";
import { resolveForkTarget } from "./github-mcp.js";

describe("resolveForkTarget", () => {
  const trending = [
    {
      fullName: "anomalyco/opencode",
      stars: 1000,
      relevanceReason: "TypeScript",
      url: "https://github.com/anomalyco/opencode",
    },
  ];

  it("resolves owner/repo shorthand", () => {
    expect(resolveForkTarget("anomalyco/opencode", trending)).toEqual({
      owner: "anomalyco",
      repo: "opencode",
    });
  });

  it("resolves repo name from trending list", () => {
    expect(resolveForkTarget("opencode", trending)).toEqual({
      owner: "anomalyco",
      repo: "opencode",
    });
  });

  it("returns null when unknown", () => {
    expect(resolveForkTarget("unknown-repo", trending)).toBeNull();
  });
});
