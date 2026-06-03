import type { GitHubRestClient } from "./github-rest.js";
import { GITHUB_API } from "./github-rest.js";
import { listUserRepositories } from "./github-read.js";

export interface DiscussionSummary {
  number: number;
  title: string;
  url: string;
  category?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  commentCount?: number;
  upvoteCount?: number;
}

async function repoNodeId(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
): Promise<string> {
  const data = await rest.graphql<{ repository: { id: string } | null }>(
    `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) { id }
    }`,
    { owner, name: repo },
  );
  if (!data.repository?.id) throw new Error(`Repository not found: ${owner}/${repo}`);
  return data.repository.id;
}

/** List discussions in a repository (GraphQL). */
export async function listDiscussions(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
  options?: { first?: number; categoryId?: string },
): Promise<{ owner: string; repo: string; discussions: DiscussionSummary[] }> {
  const first = Math.min(Math.max(options?.first ?? 20, 1), 50);
  const data = await rest.graphql<{
    repository: {
      discussions: {
        nodes: Array<{
          number: number;
          title: string;
          url: string;
          createdAt: string;
          updatedAt: string;
          upvoteCount: number;
          author?: { login: string };
          category?: { name: string };
          comments?: { totalCount: number };
        }>;
      } | null;
    } | null;
  }>(
    `query($owner: String!, $name: String!, $first: Int!, $categoryId: ID) {
      repository(owner: $owner, name: $name) {
        discussions(first: $first, orderBy: { field: UPDATED_AT, direction: DESC }, categoryId: $categoryId) {
          nodes {
            number title url createdAt updatedAt upvoteCount
            author { login }
            category { name }
            comments { totalCount }
          }
        }
      }
    }`,
    { owner, name: repo, first, categoryId: options?.categoryId ?? null },
  );

  const nodes = data.repository?.discussions?.nodes ?? [];
  return {
    owner,
    repo,
    discussions: nodes.map((d) => ({
      number: d.number,
      title: d.title,
      url: d.url,
      category: d.category?.name,
      author: d.author?.login,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      commentCount: d.comments?.totalCount,
      upvoteCount: d.upvoteCount,
    })),
  };
}

export async function getDiscussion(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
  discussionNumber: number,
): Promise<Record<string, unknown>> {
  const data = await rest.graphql<{
    repository: {
      discussion: {
        number: number;
        title: string;
        body: string;
        url: string;
        createdAt: string;
        updatedAt: string;
        author?: { login: string };
        category?: { name: string };
      } | null;
    } | null;
  }>(
    `query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        discussion(number: $number) {
          number title body url createdAt updatedAt
          author { login }
          category { name }
        }
      }
    }`,
    { owner, name: repo, number: discussionNumber },
  );

  const discussion = data.repository?.discussion;
  if (!discussion) throw new Error(`Discussion #${discussionNumber} not found in ${owner}/${repo}`);
  return {
    number: discussion.number,
    title: discussion.title,
    body: discussion.body,
    url: discussion.url,
    author: discussion.author?.login,
    category: discussion.category?.name,
    createdAt: discussion.createdAt,
    updatedAt: discussion.updatedAt,
  };
}

export async function listDiscussionComments(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
  discussionNumber: number,
  options?: { first?: number },
): Promise<{ discussion_number: number; comments: Array<Record<string, unknown>> }> {
  const first = Math.min(Math.max(options?.first ?? 50, 1), 100);
  const data = await rest.graphql<{
    repository: {
      discussion: {
        comments: {
          nodes: Array<{
            id: string;
            body: string;
            createdAt: string;
            author?: { login: string };
            url?: string;
          }>;
        } | null;
      } | null;
    } | null;
  }>(
    `query($owner: String!, $name: String!, $number: Int!, $first: Int!) {
      repository(owner: $owner, name: $name) {
        discussion(number: $number) {
          comments(first: $first) {
            nodes { id body createdAt url author { login } }
          }
        }
      }
    }`,
    { owner, name: repo, number: discussionNumber, first },
  );

  const nodes = data.repository?.discussion?.comments?.nodes ?? [];
  return {
    discussion_number: discussionNumber,
    comments: nodes.map((c) => ({
      id: c.id,
      body: c.body,
      author: c.author?.login,
      createdAt: c.createdAt,
      url: c.url,
    })),
  };
}

export async function listDiscussionCategories(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
): Promise<Array<{ id: string; name: string; slug: string }>> {
  const data = await rest.graphql<{
    repository: {
      discussionCategories: { nodes: Array<{ id: string; name: string; slug: string }> };
    } | null;
  }>(
    `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        discussionCategories(first: 20) {
          nodes { id name slug }
        }
      }
    }`,
    { owner, name: repo },
  );
  return data.repository?.discussionCategories?.nodes ?? [];
}

export async function createDiscussion(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
  title: string,
  body: string,
  categorySlug?: string,
): Promise<Record<string, unknown>> {
  const repositoryId = await repoNodeId(rest, owner, repo);
  const categories = await listDiscussionCategories(rest, owner, repo);
  const slug = categorySlug ?? "general";
  const category = categories.find((c) => c.slug === slug || c.name.toLowerCase() === slug.toLowerCase());
  if (!category) {
    throw new Error(
      `Discussion category "${slug}" not found. Available: ${categories.map((c) => c.slug).join(", ") || "(none)"}`,
    );
  }

  const result = await rest.graphql<{
    addDiscussion: { discussion: { number: number; title: string; url: string } };
  }>(
    `mutation($repoId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
      addDiscussion(input: { repositoryId: $repoId, categoryId: $categoryId, title: $title, body: $body }) {
        discussion { number title url }
      }
    }`,
    { repoId: repositoryId, categoryId: category.id, title, body },
  );

  return result.addDiscussion.discussion;
}

export async function createDiscussionComment(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
  discussionNumber: number,
  body: string,
): Promise<Record<string, unknown>> {
  const data = await rest.graphql<{
    repository: { discussion: { id: string } | null };
  }>(
    `query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        discussion(number: $number) { id }
      }
    }`,
    { owner, name: repo, number: discussionNumber },
  );
  const discussionId = data.repository?.discussion?.id;
  if (!discussionId) throw new Error(`Discussion #${discussionNumber} not found`);

  const result = await rest.graphql<{
    addDiscussionComment: { comment: { id: string; url?: string } };
  }>(
    `mutation($discussionId: ID!, $body: String!) {
      addDiscussionComment(input: { discussionId: $discussionId, body: $body }) {
        comment { id url }
      }
    }`,
    { discussionId, body },
  );

  return result.addDiscussionComment.comment;
}

/** Aggregate recent discussions across repos the user owns (cap repos scanned). */
export async function listMyDiscussions(
  rest: GitHubRestClient,
  options?: { username?: string; maxRepos?: number; perRepo?: number },
): Promise<{
  username: string;
  reposScanned: number;
  discussions: Array<DiscussionSummary & { owner: string; repo: string }>;
}> {
  const repos = await listUserRepositories(rest, {
    username: options?.username,
    type: "owner",
    maxPages: 1,
    perPage: 100,
  });
  const maxRepos = Math.min(Math.max(options?.maxRepos ?? 10, 1), 20);
  const perRepo = Math.min(Math.max(options?.perRepo ?? 5, 1), 20);

  const withDiscussions = repos.repositories.filter((r) => r.has_discussions);
  const toScan = withDiscussions.slice(0, maxRepos);
  const aggregated: Array<DiscussionSummary & { owner: string; repo: string }> = [];

  for (const repo of toScan) {
    const full = String(repo.full_name ?? "");
    const [owner, name] = full.split("/");
    if (!owner || !name) continue;
    try {
      const listed = await listDiscussions(rest, owner, name, { first: perRepo });
      for (const d of listed.discussions) {
        aggregated.push({ ...d, owner, repo: name });
      }
    } catch {
      // skip repos without discussions enabled
    }
  }

  aggregated.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  return {
    username: repos.username,
    reposScanned: toScan.length,
    discussions: aggregated,
  };
}

export function formatDiscussionsListMarkdown(result: {
  owner: string;
  repo: string;
  discussions: DiscussionSummary[];
}): string {
  if (result.discussions.length === 0) {
    return `No discussions in **${result.owner}/${result.repo}**. Enable Discussions in the repo settings if needed.`;
  }
  const lines = result.discussions.map((d) => {
    const meta = [
      d.category ? `_${d.category}_` : "",
      d.author ? `@${d.author}` : "",
      d.updatedAt ? d.updatedAt.slice(0, 10) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return `- [#${d.number} ${d.title}](${d.url})${meta ? ` — ${meta}` : ""}`;
  });
  return [`**${result.owner}/${result.repo}** — ${result.discussions.length} thread(s)`, "", ...lines].join(
    "\n",
  );
}

export function formatMyDiscussionsMarkdown(result: {
  username: string;
  reposScanned: number;
  discussions: Array<DiscussionSummary & { owner: string; repo: string }>;
}): string {
  if (result.discussions.length === 0) {
    return `No recent discussions on repos scanned for **@${result.username}** (${result.reposScanned} repo(s) with Discussions enabled).`;
  }
  const lines = result.discussions.map((d) => {
    const meta = [d.category ? `_${d.category}_` : "", d.updatedAt?.slice(0, 10) ?? ""]
      .filter(Boolean)
      .join(" · ");
    return `- [${d.owner}/${d.repo} #${d.number}](${d.url}) **${d.title}**${meta ? ` — ${meta}` : ""}`;
  });
  return [
    `**@${result.username}** — ${result.discussions.length} thread(s) across ${result.reposScanned} repo(s)`,
    "",
    ...lines,
  ].join("\n");
}

/** Parse `repo:owner/name` from a GitHub search-style query. */
export function parseRepoFromDiscussionSearchQuery(query: string): { owner: string; repo: string } | null {
  const match = query.match(/repo:([^/\s]+)\/([^/\s]+)/i);
  if (!match?.[1] || !match[2]) return null;
  return { owner: match[1], repo: match[2] };
}

/** Try REST list (works on some repos e.g. community/community). */
export async function listDiscussionsRest(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
  perPage = 20,
): Promise<{ discussions: Array<Record<string, unknown>> } | null> {
  try {
    const items = await rest.getJson<Array<Record<string, unknown>>>(
      `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/discussions?per_page=${perPage}`,
    );
    return { discussions: items };
  } catch {
    return null;
  }
}
