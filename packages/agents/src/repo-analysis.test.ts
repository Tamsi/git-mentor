import { describe, expect, it } from "vitest";
import { parseRepoTarget } from "./repo-analysis.js";

describe("parseRepoTarget", () => {
  it("uses default owner for bare repo name", () => {
    expect(parseRepoTarget("redbee-mcp", "Tamsi")).toEqual({ owner: "Tamsi", repo: "redbee-mcp" });
  });

  it("parses owner/repo form", () => {
    expect(parseRepoTarget("octocat/Hello-World", "Tamsi")).toEqual({
      owner: "octocat",
      repo: "Hello-World",
    });
  });
});
