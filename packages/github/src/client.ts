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

  /** Public profile metadata only — no manifest / dependency scanning. */
  async fetchProfileOnly(
    username: string,
    repoLimit = 30,
    onProgress?: IngestProgress,
  ): Promise<GitHubProfileData> {
    onProgress?.(`Fetching @${username} profile…`);
    const user = await this.client.getUser(username);

    onProgress?.(`Loading public repositories (up to ${repoLimit})…`);
    const repos = await this.client.getUserRepos(username, repoLimit);

    onProgress?.(`Profile indexed — ${repos.length} repos (metadata only).`);

    return {
      user: {
        login: user.login,
        name: user.name,
        bio: user.bio,
        public_repos: user.public_repos,
      },
      repos,
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
