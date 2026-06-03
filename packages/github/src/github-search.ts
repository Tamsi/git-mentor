import type { GitHubRestClient } from "./github-rest.js";
import { GITHUB_API } from "./github-rest.js";
import { listDiscussions, parseRepoFromDiscussionSearchQuery } from "./discussions.js";

export async function searchRepositories(
  rest: GitHubRestClient,
  query: string,
  options?: { sort?: string; order?: "asc" | "desc"; perPage?: number },
): Promise<{ total_count: number; items: Array<Record<string, unknown>> }> {
  const perPage = Math.min(Math.max(options?.perPage ?? 10, 1), 30);
  const params = new URLSearchParams({ q: query, per_page: String(perPage) });
  if (options?.sort) params.set("sort", options.sort);
  if (options?.order) params.set("order", options.order);

  const data = await rest.getJson<{
    total_count: number;
    items: Array<Record<string, unknown>>;
  }>(`${GITHUB_API}/search/repositories?${params}`);

  return {
    total_count: data.total_count,
    items: data.items.map((repo) => ({
      full_name: repo.full_name,
      html_url: repo.html_url,
      description: repo.description,
      stargazers_count: repo.stargazers_count,
      language: repo.language,
      updated_at: repo.updated_at,
    })),
  };
}

export async function searchCode(
  rest: GitHubRestClient,
  query: string,
  options?: { perPage?: number },
): Promise<{ total_count: number; items: Array<Record<string, unknown>> }> {
  const perPage = Math.min(Math.max(options?.perPage ?? 10, 1), 30);
  const params = new URLSearchParams({ q: query, per_page: String(perPage) });
  const data = await rest.getJson<{
    total_count: number;
    items: Array<Record<string, unknown>>;
  }>(`${GITHUB_API}/search/code?${params}`);

  return {
    total_count: data.total_count,
    items: data.items.map((hit) => ({
      name: hit.name,
      path: hit.path,
      html_url: hit.html_url,
      repository: (hit.repository as { full_name?: string })?.full_name,
    })),
  };
}

/** Search discussions — GraphQL list when query includes `repo:owner/name` (search API returns 0 for many repos). */
export async function searchDiscussions(
  rest: GitHubRestClient,
  query: string,
  options?: { perPage?: number },
): Promise<{ total_count: number; items: Array<Record<string, unknown>> }> {
  const perPage = Math.min(Math.max(options?.perPage ?? 10, 1), 30);
  const repoTarget = parseRepoFromDiscussionSearchQuery(query);
  if (repoTarget) {
    const listed = await listDiscussions(rest, repoTarget.owner, repoTarget.repo, { first: perPage });
    return {
      total_count: listed.discussions.length,
      items: listed.discussions.map((d) => ({
        title: d.title,
        html_url: d.url,
        number: d.number,
        user: d.author,
        updated_at: d.updatedAt,
        category: d.category,
        comments: d.commentCount,
        repository: `${listed.owner}/${listed.repo}`,
      })),
    };
  }

  const q = query.includes("type:discussion") ? query : `${query} type:discussion`;
  const params = new URLSearchParams({ q, per_page: String(perPage) });
  const data = await rest.getJson<{
    total_count: number;
    items: Array<Record<string, unknown>>;
  }>(`${GITHUB_API}/search/issues?${params}`);

  return {
    total_count: data.total_count,
    items: data.items.map((item) => ({
      title: item.title,
      html_url: item.html_url,
      state: item.state,
      user: (item.user as { login?: string })?.login,
      created_at: item.created_at,
      updated_at: item.updated_at,
      comments: item.comments,
      repository_url: item.repository_url,
    })),
  };
}
