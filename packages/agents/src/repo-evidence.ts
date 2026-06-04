import type { GitHubRepoData, RepoAnalysisResult } from "@git-mentor/core";

export interface RepoEvidence {
  fullName: string;
  owner: string;
  repoName: string;
  description: string | null;
  language: string | null;
  stars: number;
  topics: string[];
  manifests: string[];
  stackSignals: string[];
  dependencyMarkerCount: number;
  dependencySample: string[];
  url: string | null;
}

export function buildRepoEvidence(
  owner: string,
  repo: GitHubRepoData,
  scan: RepoAnalysisResult,
): RepoEvidence {
  const markers = repo.dependency_markers ?? [];
  return {
    fullName: scan.fullName,
    owner,
    repoName: repo.name,
    description: repo.description ?? scan.description ?? null,
    language: repo.language ?? scan.language ?? null,
    stars: repo.stargazers_count ?? scan.stars,
    topics: repo.topics ?? scan.topics,
    manifests: scan.manifests,
    stackSignals: scan.stackSignals,
    dependencyMarkerCount: markers.length,
    dependencySample: markers.slice(0, 12).map((m) => m.slice(0, 120)),
    url: repo.html_url ?? scan.url ?? null,
  };
}
