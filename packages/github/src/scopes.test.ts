import { describe, expect, it } from "vitest";
import {
  formatMissingFollowScopeMessage,
  parseOAuthScopesHeader,
  tokenCanFollowUsers,
} from "./scopes.js";

describe("tokenCanFollowUsers", () => {
  it("accepts user scope", () => {
    expect(tokenCanFollowUsers(["gist", "repo", "user"])).toBe(true);
  });

  it("accepts user:follow scope", () => {
    expect(tokenCanFollowUsers(["user:follow"])).toBe(true);
  });

  it("rejects repo-only scopes", () => {
    expect(tokenCanFollowUsers(["gist", "read:org", "repo", "workflow"])).toBe(false);
  });
});

describe("parseOAuthScopesHeader", () => {
  it("splits comma-separated scopes", () => {
    expect(parseOAuthScopesHeader("repo, user, gist")).toEqual(["repo", "user", "gist"]);
  });
});

describe("formatMissingFollowScopeMessage", () => {
  it("lists current scopes", () => {
    expect(formatMissingFollowScopeMessage(["repo", "workflow"])).toContain("`repo`");
    expect(formatMissingFollowScopeMessage(["repo", "workflow"])).toContain("/auth refresh");
  });
});
