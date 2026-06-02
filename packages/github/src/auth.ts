import { execSync } from "node:child_process";
import type { GitMentorConfig } from "@git-mentor/core";

export function hasGitHubAuth(config: GitMentorConfig): boolean {
  if (config.github.token || process.env.GIT_MENTOR_GITHUB_TOKEN) return true;
  if (!config.github.useGhCli) return false;
  try {
    const token = execSync("gh auth token", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return token.length > 0;
  } catch {
    return false;
  }
}

export async function resolveAuthenticatedUsername(config: GitMentorConfig): Promise<string | null> {
  const token =
    config.github.token ??
    process.env.GIT_MENTOR_GITHUB_TOKEN ??
    (config.github.useGhCli
      ? (() => {
          try {
            return execSync("gh auth token", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
          } catch {
            return undefined;
          }
        })()
      : undefined);

  if (!token) return null;

  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { login?: string };
    return data.login ?? null;
  } catch {
    return null;
  }
}
