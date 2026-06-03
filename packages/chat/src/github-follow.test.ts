import { describe, expect, it } from "vitest";
import { stripGitHubUsername } from "./github-follow.js";

describe("stripGitHubUsername", () => {
  it("removes leading @", () => {
    expect(stripGitHubUsername("@karpathy")).toBe("karpathy");
    expect(stripGitHubUsername("simonw")).toBe("simonw");
  });
});
