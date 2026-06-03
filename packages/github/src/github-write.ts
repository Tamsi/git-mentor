import { GitHubRestClient, GITHUB_API, githubAuthHeaders } from "./github-rest.js";

export interface UpdateUserProfileInput {
  name?: string;
  bio?: string;
  company?: string;
  blog?: string;
  location?: string;
  twitter_username?: string;
  hireable?: boolean;
}

export interface UpsertRepositoryFileInput {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  branch?: string;
}

export interface UpdateRepositoryMetadataInput {
  owner: string;
  repo: string;
  description?: string;
  homepage?: string;
  has_issues?: boolean;
  has_wiki?: boolean;
  is_template?: boolean;
}

interface ContentResponse {
  sha: string;
  content?: { sha: string };
}

export class GitHubWriteClient {
  constructor(private readonly rest: GitHubRestClient = new GitHubRestClient()) {}

  async getAuthenticatedLogin(): Promise<string> {
    const user = await this.rest.getJson<{ login: string }>(`${GITHUB_API}/user`);
    return user.login;
  }

  async updateUserProfile(input: UpdateUserProfileInput): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) body[key] = value;
    }
    if (Object.keys(body).length === 0) {
      throw new Error("updateUserProfile requires at least one field (bio, name, blog, …).");
    }
    return this.rest.patchJson(`${GITHUB_API}/user`, body);
  }

  async getFileSha(owner: string, repo: string, path: string, branch?: string): Promise<string | undefined> {
    const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
    const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}${ref}`;
    try {
      const data = await this.rest.getJson<ContentResponse>(url);
      return data.sha;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("not found")) return undefined;
      throw error;
    }
  }

  async upsertRepositoryFile(input: UpsertRepositoryFileInput): Promise<Record<string, unknown>> {
    const { owner, repo, path, content, message, branch } = input;
    const sha = await this.getFileSha(owner, repo, path, branch);
    const body: Record<string, unknown> = {
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
    };
    if (sha) body.sha = sha;
    if (branch) body.branch = branch;

    return this.rest.putJson(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      body,
    );
  }

  async updateRepositoryMetadata(input: UpdateRepositoryMetadataInput): Promise<Record<string, unknown>> {
    const { owner, repo, ...fields } = input;
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) body[key] = value;
    }
    if (Object.keys(body).length === 0) {
      throw new Error("updateRepositoryMetadata requires at least one field (description, homepage, …).");
    }
    return this.rest.patchJson(`${GITHUB_API}/repos/${owner}/${repo}`, body);
  }

  /**
   * Pin up to 6 repositories on the authenticated user's profile (GraphQL).
   */
  async pinRepositories(ownerLogin: string, repositoryFullNames: string[]): Promise<{ pinnedCount: number }> {
    const unique = [...new Set(repositoryFullNames.map((n) => n.trim()).filter(Boolean))];
    if (unique.length === 0) throw new Error("pinRepositories requires at least one owner/repo.");
    if (unique.length > 6) throw new Error("GitHub allows at most 6 pinned repositories.");

    const ownerData = await this.rest.graphql<{
      user: { id: string; repositories: { nodes: Array<{ id: string; nameWithOwner: string }> } };
    }>(
      `query($login: String!) {
        user(login: $login) {
          id
          repositories(first: 100, orderBy: { field: UPDATED_AT, direction: DESC }, ownerAffiliations: OWNER) {
            nodes { id nameWithOwner }
          }
        }
      }`,
      { login: ownerLogin },
    );

    const ownerId = ownerData.user?.id;
    if (!ownerId) throw new Error(`Could not resolve GitHub user id for @${ownerLogin}.`);

    const byName = new Map(
      ownerData.user.repositories.nodes.map((node) => [node.nameWithOwner.toLowerCase(), node.id]),
    );
    const repoIds: string[] = [];
    for (const fullName of unique) {
      const id = byName.get(fullName.toLowerCase());
      if (!id) throw new Error(`Repository not found or not owned by @${ownerLogin}: ${fullName}`);
      repoIds.push(id);
    }

    const result = await this.rest.graphql<{
      replacePinnedItems: { pinnedItems: { totalCount: number } };
    }>(
      `mutation($ownerId: ID!, $repositoryIds: [ID!]!) {
        replacePinnedItems(input: { ownerId: $ownerId, repositoryIds: $repositoryIds }) {
          pinnedItems { totalCount }
        }
      }`,
      { ownerId, repositoryIds: repoIds },
    );

    return { pinnedCount: result.replacePinnedItems.pinnedItems.totalCount };
  }
}

// --- Actions also used by MCP (fork / follow) ---

export async function forkRepository(
  rest: GitHubRestClient,
  owner: string,
  repo: string,
  organization?: string,
): Promise<unknown> {
  const url = organization
    ? `${GITHUB_API}/repos/${owner}/${repo}/forks?organization=${encodeURIComponent(organization)}`
    : `${GITHUB_API}/repos/${owner}/${repo}/forks`;
  const response = await rest.fetch(url, {
    method: "POST",
    headers: { "Content-Length": "0" },
  });
  return response.json();
}

export async function followUser(
  rest: GitHubRestClient,
  username: string,
): Promise<{ username: string; status: "followed" | "already_following" }> {
  const clean = username.replace(/^@/, "");
  const check = await fetch(`${GITHUB_API}/user/following/${encodeURIComponent(clean)}`, {
    headers: githubAuthHeaders(rest.token()),
  });
  if (check.status === 404) {
    await rest.fetch(`${GITHUB_API}/user/following/${encodeURIComponent(clean)}`, {
      method: "PUT",
      headers: { "Content-Length": "0" },
    });
    return { username: clean, status: "followed" };
  }
  if (!check.ok) {
    const text = await check.text();
    throw new Error(text || check.statusText);
  }
  return { username: clean, status: "already_following" };
}

export async function unfollowUser(
  rest: GitHubRestClient,
  username: string,
): Promise<{ username: string; status: "unfollowed" | "not_following" }> {
  const clean = username.replace(/^@/, "");
  const check = await fetch(`${GITHUB_API}/user/following/${encodeURIComponent(clean)}`, {
    headers: githubAuthHeaders(rest.token()),
  });
  if (check.status === 404) {
    return { username: clean, status: "not_following" };
  }
  if (!check.ok) {
    const text = await check.text();
    throw new Error(text || check.statusText);
  }
  await rest.delete(`${GITHUB_API}/user/following/${encodeURIComponent(clean)}`);
  return { username: clean, status: "unfollowed" };
}

export async function createRepository(
  rest: GitHubRestClient,
  options: {
    name: string;
    description?: string;
    private?: boolean;
    auto_init?: boolean;
    organization?: string;
  },
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    name: options.name,
    description: options.description,
    private: options.private ?? false,
    auto_init: options.auto_init ?? false,
  };
  const url = options.organization
    ? `${GITHUB_API}/orgs/${encodeURIComponent(options.organization)}/repos`
    : `${GITHUB_API}/user/repos`;
  return rest.postJson(url, body);
}
