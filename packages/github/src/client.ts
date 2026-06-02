import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Octokit } from "@octokit/rest";
import { CACHE_DIR, type GitMentorConfig } from "@git-mentor/core";
import type { GitHubProfileData, GitHubRepoData } from "@git-mentor/core";

const MANIFEST_FILES = [
  "package.json",
  "composer.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
];

const GITHUB_API_VERSION = "2022-11-28";

function quietOctokitLog() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

export class GitHubClient {
  private octokit: Octokit;

  constructor(private config: GitMentorConfig) {
    const token = config.github.token ?? this.tokenFromGhCli();
    this.octokit = new Octokit({
      auth: token,
      log: quietOctokitLog(),
      request: {
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      },
    });
  }

  private tokenFromGhCli(): string | undefined {
    if (!this.config.github.useGhCli) return undefined;
    try {
      return execSync("gh auth token", { encoding: "utf8" }).trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private cachePath(key: string): string {
    return path.join(CACHE_DIR, `${key.replace(/\//g, "_")}.json`);
  }

  private getCached<T>(key: string): T | undefined {
    const file = this.cachePath(key);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  }

  private setCache(key: string, data: unknown): void {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(this.cachePath(key), JSON.stringify(data));
  }

  async getUser(username: string) {
    const key = `user_${username}`;
    const cached = this.getCached<ReturnType<typeof this.fetchUser>>(key);
    if (cached) return cached;
    const data = await this.fetchUser(username);
    this.setCache(key, data);
    return data;
  }

  private async fetchUser(username: string) {
    const { data } = await this.octokit.users.getByUsername({ username });
    return data;
  }

  async getProfileReadme(username: string): Promise<string | null> {
    const key = `profile_readme_${username}`;
    const cached = this.getCached<string | null>(key);
    if (cached !== undefined) return cached;

    try {
      const { data } = await this.octokit.repos.getReadme({ owner: username, repo: username });
      const content =
        "content" in data && data.content
          ? Buffer.from(data.content, "base64").toString("utf8").slice(0, 8_000)
          : null;
      this.setCache(key, content);
      return content;
    } catch {
      this.setCache(key, null);
      return null;
    }
  }

  async getPinnedRepos(username: string): Promise<GitHubRepoData[]> {
    const key = `pinned_${username}`;
    const cached = this.getCached<GitHubRepoData[]>(key);
    if (cached) return cached;

    try {
      const result = await this.octokit.graphql<{
        user?: {
          pinnedItems?: {
            nodes?: Array<{
              name?: string;
              url?: string;
              description?: string | null;
              stargazerCount?: number;
              primaryLanguage?: { name?: string | null } | null;
              repositoryTopics?: { nodes?: Array<{ topic?: { name?: string } | null } | null> };
            } | null>;
          };
        };
      }>(
        `query ($login: String!) {
          user(login: $login) {
            pinnedItems(first: 6, types: REPOSITORY) {
              nodes {
                ... on Repository {
                  name
                  url
                  description
                  stargazerCount
                  primaryLanguage { name }
                  repositoryTopics(first: 10) {
                    nodes { topic { name } }
                  }
                }
              }
            }
          }
        }`,
        { login: username },
      );

      const nodes = result.user?.pinnedItems?.nodes ?? [];
      const repos: GitHubRepoData[] = nodes
        .filter((node): node is NonNullable<typeof node> => Boolean(node?.name))
        .map((node) => ({
          name: node.name!,
          html_url: node.url,
          description: node.description,
          language: node.primaryLanguage?.name ?? null,
          stargazers_count: node.stargazerCount ?? 0,
          topics:
            node.repositoryTopics?.nodes
              ?.map((entry) => entry?.topic?.name)
              .filter((topic): topic is string => Boolean(topic)) ?? [],
        }));

      this.setCache(key, repos);
      return repos;
    } catch {
      return [];
    }
  }

  async getRecentPublicActivity(username: string, limit = 15) {
    const key = `activity_${username}_${limit}`;
    const cached = this.getCached<Array<{ type: string; repo: string; createdAt: string }>>(key);
    if (cached) return cached;

    try {
      const { data } = await this.octokit.activity.listPublicEventsForUser({
        username,
        per_page: Math.min(limit, 30),
      });

      const events = data.slice(0, limit).map((event) => ({
        type: event.type ?? "Event",
        repo: event.repo?.name ?? "",
        createdAt: event.created_at ?? new Date().toISOString(),
      }));

      this.setCache(key, events);
      return events;
    } catch {
      return [];
    }
  }

  async getUserRepos(username: string, limit = 30): Promise<GitHubRepoData[]> {
    const key = `repos_${username}_${limit}`;
    const cached = this.getCached<GitHubRepoData[]>(key);
    if (cached) return cached;

    const { data } = await this.octokit.repos.listForUser({
      username,
      sort: "pushed",
      per_page: Math.min(limit, 100),
    });

    const repos: GitHubRepoData[] = data.slice(0, limit).map((repo) => ({
      name: repo.name,
      html_url: repo.html_url,
      description: repo.description,
      language: repo.language,
      stargazers_count: repo.stargazers_count ?? 0,
      topics: repo.topics ?? [],
      dependency_markers: [],
      pushed_at: repo.pushed_at,
      fork: repo.fork ?? false,
    }));

    this.setCache(key, repos);
    return repos;
  }

  async enrichRepo(owner: string, repo: GitHubRepoData): Promise<GitHubRepoData> {
    const dependencyMarkers: string[] = [];

    try {
      const { data: contents } = await this.octokit.repos.getContent({ owner, repo: repo.name, path: "" });
      const files = Array.isArray(contents) ? contents.filter((c) => c.type === "file").map((c) => c.name) : [];

      for (const manifest of MANIFEST_FILES) {
        if (!files.includes(manifest)) continue;
        try {
          const { data: fileData } = await this.octokit.repos.getContent({
            owner,
            repo: repo.name,
            path: manifest,
          });
          if (!Array.isArray(fileData) && "content" in fileData && fileData.content) {
            dependencyMarkers.push(
              Buffer.from(fileData.content, "base64").toString("utf8").slice(0, 4000),
            );
          }
        } catch {
          // skip unreadable manifest
        }
      }
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 451 || status === 403 || status === 404) {
        return { ...repo, dependency_markers: dependencyMarkers };
      }
    }

    return { ...repo, dependency_markers: dependencyMarkers };
  }

  async getRepository(owner: string, name: string): Promise<GitHubRepoData> {
    const key = `repo_${owner}_${name}`;
    const cached = this.getCached<GitHubRepoData>(key);
    if (cached) return cached;

    const { data } = await this.octokit.repos.get({ owner, repo: name });
    const repo: GitHubRepoData = {
      name: data.name,
      html_url: data.html_url,
      description: data.description,
      language: data.language,
      stargazers_count: data.stargazers_count ?? 0,
      topics: data.topics ?? [],
      dependency_markers: [],
    };
    this.setCache(key, repo);
    return repo;
  }

  async searchRepositories(query: string, limit = 10): Promise<SearchRepoResult[]> {
    const key = `search_${Buffer.from(query).toString("base64url").slice(0, 48)}_${limit}`;
    const cached = this.getCached<SearchRepoResult[]>(key);
    if (cached) return cached;

    try {
      const { data } = await this.octokit.search.repos({
        q: query,
        sort: "stars",
        order: "desc",
        per_page: Math.min(limit, 30),
      });

      const repos = data.items.map((item) => ({
        fullName: item.full_name,
        url: item.html_url,
        description: item.description ?? undefined,
        stars: item.stargazers_count ?? 0,
        language: item.language ?? undefined,
        topics: item.topics ?? [],
        pushedAt: item.pushed_at ?? undefined,
      }));

      this.setCache(key, repos);
      return repos;
    } catch {
      return [];
    }
  }

  async forkRepository(owner: string, repo: string): Promise<{
    fullName: string;
    htmlUrl: string;
    cloneUrl: string;
    alreadyExisted: boolean;
  }> {
    try {
      const { data } = await this.octokit.repos.createFork({ owner, repo });
      return {
        fullName: data.full_name ?? `${owner}/${repo}`,
        htmlUrl: data.html_url ?? `https://github.com/${owner}/${repo}`,
        cloneUrl: data.clone_url ?? `https://github.com/${owner}/${repo}.git`,
        alreadyExisted: false,
      };
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status !== 422) throw error;

      const authUser = await this.getAuthenticatedLogin();
      if (!authUser) throw error;

      const { data } = await this.octokit.repos.get({ owner: authUser, repo });
      return {
        fullName: data.full_name ?? `${authUser}/${repo}`,
        htmlUrl: data.html_url ?? `https://github.com/${authUser}/${repo}`,
        cloneUrl: data.clone_url ?? `https://github.com/${authUser}/${repo}.git`,
        alreadyExisted: true,
      };
    }
  }

  async getAuthenticatedLogin(): Promise<string | null> {
    try {
      const { data } = await this.octokit.users.getAuthenticated();
      return data.login ?? null;
    } catch {
      return null;
    }
  }
}

export interface SearchRepoResult {
  fullName: string;
  url: string;
  description?: string;
  stars: number;
  language?: string;
  topics: string[];
  pushedAt?: string;
}

export type IngestProgress = (message: string) => void;

export class GitHubIngestor {
  constructor(private client: GitHubClient) {}

  /** Public profile presentation audit — bio, README, pins, stats, activity. No manifest scan. */
  async fetchProfileOnly(
    username: string,
    repoLimit = 30,
    onProgress?: IngestProgress,
  ): Promise<GitHubProfileData> {
    onProgress?.(`Fetching @${username} GitHub profile…`);
    const user = await this.client.getUser(username);

    onProgress?.(`Loading profile README, pins, and public stats…`);
    const [profileReadme, pinnedRepos, recentActivity] = await Promise.all([
      this.client.getProfileReadme(username),
      this.client.getPinnedRepos(username),
      this.client.getRecentPublicActivity(username, 15),
    ]);

    onProgress?.(`Indexing public repositories (up to ${repoLimit})…`);
    const repos = await this.client.getUserRepos(username, repoLimit);

    onProgress?.(
      `Profile indexed — attractiveness signals ready (${repos.length} repos, ${pinnedRepos.length} pins).`,
    );

    return {
      user: {
        login: user.login,
        name: user.name,
        bio: user.bio,
        public_repos: user.public_repos,
        followers: user.followers,
        following: user.following,
        public_gists: user.public_gists,
        company: user.company,
        location: user.location,
        blog: user.blog,
        twitter_username: user.twitter_username,
        created_at: user.created_at,
      },
      repos,
      profileReadme,
      pinnedRepos,
      recentActivity,
    };
  }

  /** Deep scan of a single repository (manifests, dependencies). */
  async fetchRepoForAnalysis(
    owner: string,
    repoName: string,
    onProgress?: IngestProgress,
  ): Promise<GitHubRepoData> {
    onProgress?.(`Loading ${owner}/${repoName}…`);
    let repo = await this.client.getRepository(owner, repoName);

    onProgress?.(`Scanning manifests and dependencies…`);
    repo = await this.client.enrichRepo(owner, repo);

    onProgress?.(`Repository analysis ready.`);
    return repo;
  }

  /** @deprecated Use fetchProfileOnly or fetchRepoForAnalysis */
  async fetchProfileData(
    username: string,
    repoLimit = 30,
    onProgress?: IngestProgress,
  ): Promise<GitHubProfileData> {
    return this.fetchProfileOnly(username, repoLimit, onProgress);
  }
}
