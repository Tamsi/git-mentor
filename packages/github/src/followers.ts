import type { GitHubRestClient } from "./github-rest.js";
import { GITHUB_API } from "./github-rest.js";
import { resolveGitHubLogin } from "./following.js";

export interface FollowerUserEntry {
  login: string;
  html_url?: string;
  name?: string;
}

export interface ListFollowersResult {
  username: string;
  count: number;
  followers: FollowerUserEntry[];
  truncated: boolean;
}

/** List users who follow the given account (authenticated user if username omitted). */
export async function listFollowers(
  rest: GitHubRestClient,
  options?: { username?: string; perPage?: number; maxPages?: number },
): Promise<ListFollowersResult> {
  const target = await resolveGitHubLogin(rest, options?.username);
  const perPage = Math.min(Math.max(options?.perPage ?? 100, 1), 100);
  const maxPages = Math.min(Math.max(options?.maxPages ?? 3, 1), 10);

  const base = options?.username?.trim()
    ? `${GITHUB_API}/users/${encodeURIComponent(target)}/followers`
    : `${GITHUB_API}/user/followers`;

  const followers: FollowerUserEntry[] = [];
  let truncated = false;

  for (let page = 1; page <= maxPages; page++) {
    const batch = await rest.getJson<
      Array<{ login: string; html_url?: string; name?: string | null }>
    >(`${base}?per_page=${perPage}&page=${page}`);
    if (batch.length === 0) break;
    for (const user of batch) {
      followers.push({
        login: user.login,
        html_url: user.html_url,
        name: user.name ?? undefined,
      });
    }
    if (batch.length < perPage) break;
    if (page === maxPages) truncated = true;
  }

  return { username: target, count: followers.length, followers, truncated };
}

export function formatFollowersListMarkdown(result: ListFollowersResult): string {
  if (result.count === 0) {
    return `**@${result.username}** has no followers listed (or the list is unavailable).`;
  }
  const lines = result.followers.map((user) => {
    const url = user.html_url ?? `https://github.com/${user.login}`;
    const label = user.name ? ` — ${user.name}` : "";
    return `- [@${user.login}](${url})${label}`;
  });
  const header = `**Followers (${result.count})** — @${result.username}`;
  const note = result.truncated
    ? "\n\n_Showing first pages only. Use GitHub UI for the full list._"
    : "";
  return [header, "", ...lines].join("\n") + note;
}
