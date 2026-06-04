import type { AnalysisResult } from "@git-mentor/core";
import { getRole } from "@git-mentor/core";

export interface ProfileRepoFact {
  fullName: string;
  name: string;
  stars: number;
  language: string | null;
  topics: string[];
  description: string | null;
  pushedAt: string | null;
}

export interface ProfileFacts {
  username: string;
  targetRoleId: string;
  targetRoleName: string;
  publicRepoCount: number;
  pinnedCount: number;
  pinnedRepoNames: string[];
  totalStars: number;
  followers: number | null;
  following: number | null;
  attractivenessScore: number | null;
  fitScore: number | null;
  bio: string | null;
  profileReadmeExcerpt: string | null;
  topRepos: ProfileRepoFact[];
  gaps: Array<{ area: string; currentLevel: string; targetLevel: string; rationale: string }>;
  strengthsForRole: string[];
  weaknesses: string[];
  primaryStack: string[];
  maturityScore: number;
}

const BOOTCAMP_REPO = /piscine|42-school|school|exercise|tutorial|hello-world/i;

function repoScore(
  repo: { name: string; stargazers_count?: number; pushed_at?: string | null },
  username: string,
): number {
  if (BOOTCAMP_REPO.test(repo.name)) return 0;
  const stars = repo.stargazers_count ?? 0;
  const pushed = repo.pushed_at ? Date.parse(repo.pushed_at) : 0;
  const recency = pushed > 0 ? Math.min(1, (Date.now() - pushed) / (1000 * 60 * 60 * 24 * 365)) : 1;
  const recencyBoost = (1 - recency) * 5;
  return stars * 2 + recencyBoost + (repo.name.includes("-mcp") ? 3 : 0);
}

export function rankTopRepos(
  repos: Array<{
    name: string;
    stargazers_count?: number;
    pushed_at?: string | null;
    language?: string | null;
    topics?: string[];
    description?: string | null;
    html_url?: string;
  }>,
  username: string,
  limit = 8,
): ProfileRepoFact[] {
  return [...repos]
    .sort((a, b) => repoScore(b, username) - repoScore(a, username))
    .slice(0, limit)
    .map((repo) => ({
      fullName: `${username}/${repo.name}`,
      name: repo.name,
      stars: repo.stargazers_count ?? 0,
      language: repo.language ?? null,
      topics: repo.topics ?? [],
      description: repo.description ?? null,
      pushedAt: repo.pushed_at ?? null,
    }));
}

export function buildProfileFacts(result: AnalysisResult, roleId: string): ProfileFacts {
  const { profile } = result;
  const github = result.githubData;
  const role = getRole(roleId);
  const attractiveness = profile.metadata?.attractiveness as { score?: number } | undefined;
  const pinned = github?.pinnedRepos ?? [];
  const repos = github?.repos ?? [];

  const topRepos = rankTopRepos(repos, profile.username);

  const readme = github?.profileReadme?.trim();
  return {
    username: profile.username,
    targetRoleId: roleId,
    targetRoleName: role.name,
    publicRepoCount: profile.repoCount,
    pinnedCount: pinned.length,
    pinnedRepoNames: pinned.map((r) => r.name),
    totalStars: profile.totalStars,
    followers: github?.user.followers ?? null,
    following: github?.user.following ?? null,
    attractivenessScore: attractiveness?.score ?? null,
    fitScore: result.gapAnalysis?.fitScore ?? null,
    bio: github?.user.bio ?? null,
    profileReadmeExcerpt: readme ? readme.slice(0, 1200) : null,
    topRepos,
    gaps: (result.gapAnalysis?.gaps ?? []).slice(0, 8).map((g) => ({
      area: g.area,
      currentLevel: g.currentLevel,
      targetLevel: g.targetLevel,
      rationale: g.rationale,
    })),
    strengthsForRole: result.gapAnalysis?.strengthsForRole ?? [],
    weaknesses: profile.weaknesses,
    primaryStack: profile.primaryStack.slice(0, 6),
    maturityScore: profile.maturityScore,
  };
}

/** Reject LLM openings that contradict structured facts (e.g. pins when pinnedCount is 0). */
export function openingContradictsFacts(opening: string, facts: ProfileFacts): boolean {
  const lower = opening.toLowerCase();
  const admitsNoPins =
    /\b(no pinned|0 pinned|without pins|missing pins|aren't pinned|are not pinned|no pins yet)\b/.test(
      lower,
    );

  if (facts.pinnedCount === 0) {
    if (admitsNoPins) return false;
    if (/\b[1-9]\d*\s+pinned\b/.test(lower)) return true;
    if (/\bpinned collection\b/.test(lower)) return true;
    if (/\bcurated.{0,40}pin/.test(lower)) return true;
    if (/\bset of.{0,30}pin/.test(lower)) return true;
  }
  if (facts.pinnedCount > 0 && admitsNoPins) {
    return true;
  }
  return false;
}
