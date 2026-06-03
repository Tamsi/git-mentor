import { execSync } from "node:child_process";
import type { GitMentorConfig } from "@git-mentor/core";
import { resolveGitHubTokenForMcp } from "./mcp-setup.js";

const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";

/** OAuth scopes that allow PUT /user/following/{username}. */
export function tokenCanFollowUsers(scopes: string[]): boolean {
  const normalized = scopes.map((s) => s.trim().toLowerCase()).filter(Boolean);
  return normalized.includes("user") || normalized.includes("user:follow");
}

export function parseOAuthScopesHeader(header: string | null): string[] {
  if (!header?.trim()) return [];
  return header.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function fetchOAuthScopesForToken(token: string): Promise<string[]> {
  const response = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
    },
  });
  const fromHeader = parseOAuthScopesHeader(response.headers.get("x-oauth-scopes"));
  if (fromHeader.length > 0) return fromHeader;
  return [];
}

export function parseGhAuthStatusScopes(): string[] | null {
  try {
    const output = execSync("gh auth status", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    const match = output.match(/Token scopes:\s*'([^']*)'/);
    if (!match?.[1]) return null;
    return match[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

export async function resolveGitHubOAuthScopes(config: GitMentorConfig): Promise<string[]> {
  const token = resolveGitHubTokenForMcp(config);
  if (token) {
    const apiScopes = await fetchOAuthScopesForToken(token);
    if (apiScopes.length > 0) return apiScopes;
  }
  if (config.github.useGhCli) {
    return parseGhAuthStatusScopes() ?? [];
  }
  return [];
}

export function formatMissingFollowScopeMessage(scopes: string[]): string {
  const listed = scopes.length > 0 ? scopes.map((s) => `\`${s}\``).join(", ") : "_none detected_";
  return [
    "Your GitHub token cannot follow users yet — the **`user`** OAuth scope is missing (it includes **`user:follow`**).",
    "",
    `**Current scopes:** ${listed}`,
    "",
    "In gitmentor chat, run **`/auth refresh`** (or in a terminal: `gitmentor auth refresh`).",
    "",
    "Approve the browser prompt, then run **`/follow apply`** again.",
  ].join("\n");
}

export async function assertCanFollowUsers(config: GitMentorConfig): Promise<void> {
  const scopes = await resolveGitHubOAuthScopes(config);
  if (tokenCanFollowUsers(scopes)) return;
  throw new Error(formatMissingFollowScopeMessage(scopes));
}
