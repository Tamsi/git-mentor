import type { DeveloperProfile, GapAnalysis, GitHubProfileData, TrendingRepo } from "@git-mentor/core";
import type { GitHubClient } from "./client.js";

const LANGUAGE_SEARCH: Record<string, string> = {
  typescript: "typescript",
  javascript: "javascript",
  python: "python",
  go: "go",
  rust: "rust",
  java: "java",
  php: "php",
  ruby: "ruby",
  "c#": "csharp",
  "c++": "cpp",
  shell: "shell",
  docker: "dockerfile",
};

const DOMAIN_TOPICS: Record<string, string[]> = {
  "ai engineering": ["llm", "machine-learning", "mcp", "agents"],
  "backend architecture": ["api", "microservices", "backend"],
  frontend: ["react", "frontend", "typescript"],
  "cloud infrastructure": ["kubernetes", "docker", "devops"],
  "open source": ["opensource", "good-first-issue"],
  "api design": ["openapi", "graphql", "rest-api"],
};

function languageQuery(language: string): string | undefined {
  return LANGUAGE_SEARCH[language.toLowerCase()] ?? language.toLowerCase().replace(/\s+/g, "-");
}

export function buildDiscoveryQueries(profile: DeveloperProfile, gapAnalysis?: GapAnalysis): string[] {
  const queries: string[] = [];
  const since = new Date();
  since.setMonth(since.getMonth() - 6);
  const pushedAfter = since.toISOString().slice(0, 10);

  for (const lang of profile.primaryStack.slice(0, 2)) {
    const ghLang = languageQuery(lang);
    if (ghLang) {
      queries.push(`language:${ghLang} stars:>200 pushed:>${pushedAfter} fork:false archived:false`);
    }
  }

  for (const domain of profile.domains.slice(0, 2)) {
    const topics = DOMAIN_TOPICS[domain.name.toLowerCase()] ?? [];
    if (topics[0]) {
      queries.push(`topic:${topics[0]} stars:>500 pushed:>${pushedAfter} fork:false archived:false`);
    }
  }

  for (const gap of gapAnalysis?.gaps.slice(0, 2) ?? []) {
    const topic = gap.area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (topic.length >= 3) {
      queries.push(`topic:${topic} stars:>100 pushed:>${pushedAfter} fork:false archived:false`);
    }
  }

  if (queries.length === 0) {
    queries.push(`stars:>1000 pushed:>${pushedAfter} fork:false archived:false`);
  }

  return [...new Set(queries)].slice(0, 4);
}

function relevanceReason(
  repo: { language?: string | null; topics?: string[] },
  profile: DeveloperProfile,
): string {
  const lang = repo.language?.toLowerCase();
  if (lang && profile.primaryStack.some((s) => s.toLowerCase() === lang)) {
    return `Trending in your primary stack (${repo.language})`;
  }
  const domain = profile.domains[0]?.name;
  if (domain) return `Active project aligned with ${domain}`;
  return "High-activity repository in a related ecosystem";
}

export class GitHubRepoDiscovery {
  constructor(private client: GitHubClient) {}

  async discoverTrending(
    profile: DeveloperProfile,
    gapAnalysis?: GapAnalysis,
    limit = 8,
  ): Promise<TrendingRepo[]> {
    const queries = buildDiscoveryQueries(profile, gapAnalysis);
    const seen = new Set<string>();
    const results: TrendingRepo[] = [];

    for (const q of queries) {
      if (results.length >= limit) break;
      const batch = await this.client.searchRepositories(q, Math.min(6, limit - results.length + 2));
      for (const repo of batch) {
        const owner = repo.fullName.split("/")[0]?.toLowerCase();
        if (owner === profile.username.toLowerCase() || seen.has(repo.fullName)) continue;
        seen.add(repo.fullName);
        results.push({
          ...repo,
          relevanceReason: relevanceReason(repo, profile),
        });
        if (results.length >= limit) break;
      }
    }

    return results.sort((a, b) => b.stars - a.stars).slice(0, limit);
  }
}