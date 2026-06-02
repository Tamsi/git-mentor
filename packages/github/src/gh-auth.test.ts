import { describe, expect, it } from "vitest";
import { ghScopesFlag, GITMENTOR_GH_SCOPES, parseGhAuthStatusOutput } from "./gh-auth.js";
import { tokenCanFollowUsers } from "./scopes.js";

describe("parseGhAuthStatusOutput", () => {
  it("parses logged-in account and scopes", () => {
    const output = `github.com
  ✓ Logged in to github.com account Tamsi (keyring)
  - Active account: true
  - Token scopes: 'gist', 'read:org', 'repo', 'user', 'workflow'`;
    const parsed = parseGhAuthStatusOutput(output);
    expect(parsed.loggedIn).toBe(true);
    expect(parsed.account).toBe("Tamsi");
    expect(parsed.scopes).toContain("user");
    expect(tokenCanFollowUsers(parsed.scopes)).toBe(true);
  });

  it("detects missing follow scope", () => {
    const output = `github.com
  ✓ Logged in to github.com account Tamsi (keyring)
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'`;
    const parsed = parseGhAuthStatusOutput(output);
    expect(parsed.loggedIn).toBe(true);
    expect(tokenCanFollowUsers(parsed.scopes)).toBe(false);
  });
});

describe("ghScopesFlag", () => {
  it("includes user scope for follow", () => {
    expect(ghScopesFlag(GITMENTOR_GH_SCOPES)).toContain("user");
  });
});
