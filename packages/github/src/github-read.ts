import { resolveGitHubLogin } from "./following.js";
import type { GitHubRestClient } from "./github-rest.js";
import { GITHUB_API } from "./github-rest.js";

export async function getUser(
  rest: GitHubRestClient,
  username?: string,
): Promise<Record<string, unknown>> {
  const login = await resolveGitHubLogin(rest, username);
  const path = username?.trim()
    ? `${GITHUB_API}/users/${encodeURIComponent(login)}`
    : `${GITHUB_API}/user`;
  const user = await rest.getJson<Record<string, unknown>>(path);
  return {
    login: user.login,
    name: user.name,
    bio: user.bio,
    company: user.company,
    blog: user.blog,
    location: user.location,
    twitter_username: user.twitter_username,
    public_repos: user.public_repos,
    followers: user.followers,
    following: user.following,
    created_at: user.created_at,
    html_url: user.html_url,
    hireable: user.hireable,
  };
}

export async function listUserRepositories(
  rest: GitHubRestClient,
  options?: {
    username?: string;
    type?: "all" | "owner" | "member" | "public";
    sort?: "created" | "updated" | "pushed" | "full_name";
    perPage?: number;
    maxPages?: number;
  },
): Promise<{ username: string; count: number; repositories: Array<Record<string, unknown>>; truncated: boolean }> {
  const login = await resolveGitHubLogin(rest, options?.username);
  const perPage = Math.min(Math.max(options?.perPage ?? 100, 1), 100);
  const maxPages = Math.min(Math.max(options?.maxPages ?? 2, 1), 5);
  const type = options?.type ?? "owner";
  const sort = options?.sort ?? "updated";

  const base = options?.username?.trim()
    ? `${GITHUB_API}/users/${encodeURIComponent(login)}/repos`
    : `${GITHUB_API}/user/repos`;

  const repositories: Array<Record<string, unknown>> = [];
  let truncated = false;

  for (let page = 1; page <= maxPages; page++) {
    const batch = await rest.getJson<Array<Record<string, unknown>>>(
      `${base}?per_page=${perPage}&page=${page}&type=${type}&sort=${sort}`,
    );
    if (batch.length === 0) break;
    for (const repo of batch) {
      repositories.push({
        full_name: repo.full_name,
        name: repo.name,
        owner: (repo.owner as { login?: string })?.login,
        description: repo.description,
        html_url: repo.html_url,
        stargazers_count: repo.stargazers_count,
        forks_count: repo.forks_count,
        language: repo.language,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
        private: repo.private,
        fork: repo.fork,
        has_discussions: repo.has_discussions,
      });
    }
    if (batch.length < perPage) break;
    if (page === maxPages) truncated = true;
  }

  return { username: login, count: repositories.length, repositories, truncated };
}

export async function getRepository(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
): Promise<Record<string, unknown>> {
  const data = await rest.getJson<Record<string, unknown>>(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  );
  return {
    full_name: data.full_name,
    description: data.description,
    html_url: data.html_url,
    homepage: data.homepage,
    default_branch: data.default_branch,
    stargazers_count: data.stargazers_count,
    forks_count: data.forks_count,
    open_issues_count: data.open_issues_count,
    language: data.language,
    topics: data.topics,
    has_discussions: data.has_discussions,
    license: (data.license as { spdx_id?: string })?.spdx_id,
    created_at: data.created_at,
    updated_at: data.updated_at,
    pushed_at: data.pushed_at,
  };
}

export async function getRepositoryFile(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<{ path: string; sha: string; size: number; content: string; encoding: string }> {
  const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const data = await rest.getJson<{
    path: string;
    sha: string;
    size: number;
    content?: string;
    encoding?: string;
  }>(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}${refQuery}`,
  );
  if (!data.content) throw new Error(`Path is not a file or content unavailable: ${path}`);
  const encoding = data.encoding ?? "base64";
  const content =
    encoding === "base64" ? Buffer.from(data.content, "base64").toString("utf8") : data.content;
  return { path: data.path, sha: data.sha, size: data.size, content, encoding };
}

export async function listRepositoryCommits(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
  maxCount = 20,
): Promise<{ count: number; commits: Array<{ sha: string; message: string; author?: string; date?: string }> }> {
  const perPage = Math.min(Math.max(maxCount, 1), 100);
  const batch = await rest.getJson<
    Array<{ sha: string; commit: { message: string; author?: { name?: string; date?: string } } }>
  >(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=${perPage}`,
  );
  const commits = batch.map((c) => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0] ?? c.commit.message,
    author: c.commit.author?.name,
    date: c.commit.author?.date,
  }));
  return { count: commits.length, commits };
}

export async function listRepositoryBranches(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
  maxCount = 30,
): Promise<{ count: number; branches: string[] }> {
  const perPage = Math.min(Math.max(maxCount, 1), 100);
  const batch = await rest.getJson<Array<{ name: string }>>(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=${perPage}`,
  );
  const branches = batch.map((b) => b.name);
  return { count: branches.length, branches };
}

export async function listStarredRepositories(
  rest: GitHubRestClient,
  options?: { username?: string; perPage?: number; maxPages?: number },
): Promise<{ username: string; count: number; repositories: Array<Record<string, unknown>>; truncated: boolean }> {
  const login = await resolveGitHubLogin(rest, options?.username);
  const perPage = Math.min(Math.max(options?.perPage ?? 100, 1), 100);
  const maxPages = Math.min(Math.max(options?.maxPages ?? 2, 1), 5);

  const base = options?.username?.trim()
    ? `${GITHUB_API}/users/${encodeURIComponent(login)}/starred`
    : `${GITHUB_API}/user/starred`;

  const repositories: Array<Record<string, unknown>> = [];
  let truncated = false;

  for (let page = 1; page <= maxPages; page++) {
    const batch = await rest.getJson<Array<Record<string, unknown>>>(
      `${base}?per_page=${perPage}&page=${page}`,
    );
    if (batch.length === 0) break;
    for (const repo of batch) {
      repositories.push({
        full_name: repo.full_name,
        html_url: repo.html_url,
        description: repo.description,
        stargazers_count: repo.stargazers_count,
        language: repo.language,
      });
    }
    if (batch.length < perPage) break;
    if (page === maxPages) truncated = true;
  }

  return { username: login, count: repositories.length, repositories, truncated };
}
