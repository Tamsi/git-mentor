import type { GitHubRestClient } from "./github-rest.js";
import { GITHUB_API } from "./github-rest.js";

export interface FollowingUserEntry {
  login: string;
  html_url?: string;
  name?: string;
}

export interface ListFollowingResult {
  username: string;
  count: number;
  following: FollowingUserEntry[];
  truncated: boolean;
}

export async function resolveGitHubLogin(
  rest: GitHubRestClient,
  username?: string,
): Promise<string> {
  if (username?.trim()) return username.replace(/^@/, "").trim();
  const user = await rest.getJson<{ login: string }>(`${GITHUB_API}/user`);
  return user.login;
}

/** List users the given account follows (authenticated user if username omitted). */
export async function listFollowing(
  rest: GitHubRestClient,
  options?: { username?: string; perPage?: number; maxPages?: number },
): Promise<ListFollowingResult> {
  const target = await resolveGitHubLogin(rest, options?.username);
  const perPage = Math.min(Math.max(options?.perPage ?? 100, 1), 100);
  const maxPages = Math.min(Math.max(options?.maxPages ?? 3, 1), 10);

  const base = options?.username?.trim()
    ? `${GITHUB_API}/users/${encodeURIComponent(target)}/following`
    : `${GITHUB_API}/user/following`;

  const following: FollowingUserEntry[] = [];
  let truncated = false;

  for (let page = 1; page <= maxPages; page++) {
    const batch = await rest.getJson<
      Array<{ login: string; html_url?: string; name?: string | null }>
    >(`${base}?per_page=${perPage}&page=${page}`);
    if (batch.length === 0) break;
    for (const user of batch) {
      following.push({
        login: user.login,
        html_url: user.html_url,
        name: user.name ?? undefined,
      });
    }
    if (batch.length < perPage) break;
    if (page === maxPages) truncated = true;
  }

  return { username: target, count: following.length, following, truncated };
}

export function formatFollowingListMarkdown(result: ListFollowingResult): string {
  if (result.count === 0) {
    return `**@${result.username}** is not following anyone (or the list is unavailable).`;
  }
  const lines = result.following.map((user) => {
    const url = user.html_url ?? `https://github.com/${user.login}`;
    const label = user.name ? ` — ${user.name}` : "";
    return `- [@${user.login}](${url})${label}`;
  });
  const header = `**Following (${result.count})** — @${result.username}`;
  const note = result.truncated ? "\n\n_Showing first pages only. Ask for a specific user or use GitHub UI for the full list._" : "";
  return [header, "", ...lines].join("\n") + note;
}
