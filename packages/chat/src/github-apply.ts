import type { GitMentorConfig } from "@git-mentor/core";
import {
  GITHUB_MCP_SERVER_NAME,
  isGitHubMcpEnabled,
  resolveAuthenticatedUsername,
} from "@git-mentor/github";
import { stripAtUsername } from "./command-utils.js";
import { callExternalMcpTool } from "./mcp-client.js";
import { formatToolResult } from "./prompts.js";
import type { ChatReply } from "./types.js";

export async function assertCanWriteGitHub(
  config: GitMentorConfig,
  sessionUsername: string,
): Promise<string> {
  if (!isGitHubMcpEnabled(config)) {
    throw new Error(
      "GitHub MCP is not enabled. Run **`/auth login`** then restart chat, or run `gitmentor init`.",
    );
  }
  const authLogin = await resolveAuthenticatedUsername(config);
  if (!authLogin) {
    throw new Error("No GitHub token. Run **`/auth login`** or `gitmentor auth login`.");
  }
  if (authLogin.toLowerCase() !== stripAtUsername(sessionUsername).toLowerCase()) {
    throw new Error(
      `Writes are only allowed for your authenticated account (@${authLogin}). You are coaching @${sessionUsername}.`,
    );
  }
  return authLogin;
}

export async function applyBio(
  config: GitMentorConfig,
  sessionUsername: string,
  bio: string,
): Promise<ChatReply> {
  await assertCanWriteGitHub(config, sessionUsername);
  const raw = await callExternalMcpTool(config, GITHUB_MCP_SERVER_NAME, "update_user_profile", {
    bio,
  });
  return {
    content: formatToolResult("GitHub profile updated", `Bio applied for @${sessionUsername}.\n\n${raw}`),
    toolUsed: "apply-bio",
  };
}

export async function applyReadme(
  config: GitMentorConfig,
  sessionUsername: string,
  content: string,
  repoTarget?: string,
): Promise<ChatReply> {
  const login = await assertCanWriteGitHub(config, sessionUsername);
  let owner = login;
  let repo = login;
  if (repoTarget?.includes("/")) {
    const [o, r] = repoTarget.split("/").filter(Boolean);
    if (o && r) {
      owner = o;
      repo = r;
    }
  }

  const raw = await callExternalMcpTool(config, GITHUB_MCP_SERVER_NAME, "upsert_repository_file", {
    owner,
    repo,
    path: "README.md",
    content,
    message: "Update README via gitmentor",
  });
  return {
    content: formatToolResult(
      "README committed",
      `Updated \`${owner}/${repo}/README.md\`.\n\n${raw}`,
    ),
    toolUsed: "apply-readme",
  };
}

export async function applyPin(
  config: GitMentorConfig,
  sessionUsername: string,
  repositories: string[],
): Promise<ChatReply> {
  await assertCanWriteGitHub(config, sessionUsername);
  const raw = await callExternalMcpTool(config, GITHUB_MCP_SERVER_NAME, "pin_repositories", {
    repositories,
  });
  return {
    content: formatToolResult("Pinned repositories", raw),
    toolUsed: "apply-pin",
  };
}

export const APPLY_USAGE = [
  "**Apply GitHub writes** (authenticated user only — same account as `gh auth`)",
  "- `/apply bio <text>` — update profile bio",
  "- `/apply readme <markdown>` — commit README.md on your profile repo (`user/user`)",
  "- `/apply readme owner/repo <markdown>` — commit README on another repo you own",
  "- `/apply pin owner/repo [owner/repo …]` — pin up to 6 repos (max 6)",
  "",
  "Advanced: `/mcp call github update_user_profile {\"bio\":\"…\"}`",
  "`/mcp call github upsert_repository_file {\"owner\":\"…\",\"repo\":\"…\",\"path\":\"README.md\",\"content\":\"…\",\"message\":\"…\"}`",
].join("\n");
