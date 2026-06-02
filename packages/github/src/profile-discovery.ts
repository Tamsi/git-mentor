import type { DeveloperProfile, GapAnalysis, ProfileToFollow, TrendingRepo } from "@git-mentor/core";
import type { GitHubClient } from "./client.js";

export interface CuratedProfileHint {
  username: string;
  relevanceReason: string;
  source: "curated" | "maintainer";
}

/** Evidence-backed role models — public GitHub profiles aligned with target roles. */
export const ROLE_PROFILE_HINTS: Record<string, CuratedProfileHint[]> = {
  "ai-engineer": [
    { username: "karpathy", relevanceReason: "Deep learning education and production ML perspective", source: "curated" },
    { username: "jerryjliu", relevanceReason: "LLM apps, RAG, and the LlamaIndex ecosystem", source: "curated" },
    { username: "hwchase17", relevanceReason: "LangChain and agent tooling maintainer", source: "curated" },
    { username: "tmc", relevanceReason: "Local LLM tooling (Ollama)", source: "curated" },
    { username: "simonw", relevanceReason: "Practical LLM tooling and dataset-driven AI engineering", source: "curated" },
  ],
  "full-stack": [
    { username: "sindresorhus", relevanceReason: "Prolific OSS author across the JavaScript ecosystem", source: "curated" },
    { username: "shadcn", relevanceReason: "Modern React UI patterns and component design", source: "curated" },
    { username: "rauchg", relevanceReason: "Full-stack product engineering and developer experience", source: "curated" },
    { username: "antfu", relevanceReason: "TypeScript tooling and full-stack OSS velocity", source: "curated" },
  ],
  "staff-engineer": [
    { username: "rsc", relevanceReason: "Go language leadership and large-scale systems design", source: "curated" },
    { username: "jessfraz", relevanceReason: "Infrastructure, containers, and OSS leadership", source: "curated" },
    { username: "mattt", relevanceReason: "API design, platform work, and technical writing", source: "curated" },
    { username: "dhh", relevanceReason: "Product-minded technical direction at scale", source: "curated" },
  ],
  "software-architect": [
    { username: "martinfowler", relevanceReason: "Architecture patterns and software design writing", source: "curated" },
    { username: "kelseyhightower", relevanceReason: "Cloud-native architecture and platform thinking", source: "curated" },
    { username: "rsc", relevanceReason: "Systems design and language/platform evolution", source: "curated" },
    { username: "jessfraz", relevanceReason: "Infrastructure architecture and operational excellence", source: "curated" },
  ],
  "oss-maintainer": [
    { username: "yyx990803", relevanceReason: "Sustained OSS maintenance (Vue.js ecosystem)", source: "curated" },
    { username: "ebidel", relevanceReason: "Developer tools and open-source community leadership", source: "curated" },
    { username: "sindresorhus", relevanceReason: "High-velocity OSS maintenance and release discipline", source: "curated" },
    { username: "feross", relevanceReason: "Security-focused OSS and maintainer workflows", source: "curated" },
  ],
};

export function buildProfileFollowCandidates(
  profile: DeveloperProfile,
  roleId: string,
  trendingRepos: TrendingRepo[] = [],
): CuratedProfileHint[] {
  const exclude = profile.username.toLowerCase();
  const seen = new Set<string>();
  const candidates: CuratedProfileHint[] = [];

  const push = (username: string, relevanceReason: string, source: CuratedProfileHint["source"]) => {
    const key = username.toLowerCase();
    if (key === exclude || seen.has(key)) return;
    seen.add(key);
    candidates.push({ username, relevanceReason, source });
  };

  for (const hint of ROLE_PROFILE_HINTS[roleId] ?? ROLE_PROFILE_HINTS["ai-engineer"] ?? []) {
    push(hint.username, hint.relevanceReason, hint.source);
  }

  for (const repo of trendingRepos) {
    const owner = repo.fullName.split("/")[0];
    if (!owner) continue;
    push(owner, `Maintainer of trending repo \`${repo.fullName}\` in your stack`, "maintainer");
  }

  return candidates;
}

export function formatProfilesToFollowMarkdown(profiles: ProfileToFollow[]): string {
  if (profiles.length === 0) {
    return "_No profiles to suggest yet. Run `/follow refresh` after `/trending`._";
  }

  return profiles
    .map((entry) => {
      const label = entry.name ? `**[@${entry.username}](${entry.url})** (${entry.name})` : `**[@${entry.username}](${entry.url})**`;
      const followers = entry.followers != null ? ` · ${entry.followers.toLocaleString()} followers` : "";
      const bio =
        entry.bio?.trim()
          ? `\n  _${entry.bio.trim().slice(0, 140)}${entry.bio.length > 140 ? "…" : ""}_`
          : "";
      return `- ${label}${followers} — ${entry.relevanceReason}${bio}`;
    })
    .join("\n");
}

export class GitHubProfileDiscovery {
  constructor(private client: GitHubClient) {}

  async discoverProfilesToFollow(
    profile: DeveloperProfile,
    roleId: string,
    options?: {
      gapAnalysis?: GapAnalysis;
      trendingRepos?: TrendingRepo[];
      limit?: number;
    },
  ): Promise<ProfileToFollow[]> {
    const limit = options?.limit ?? 8;
    const candidates = buildProfileFollowCandidates(
      profile,
      roleId,
      options?.trendingRepos ?? [],
    ).slice(0, limit + 4);

    const results: ProfileToFollow[] = [];

    for (const candidate of candidates) {
      if (results.length >= limit) break;
      try {
        const user = await this.client.getUser(candidate.username);
        results.push({
          username: user.login,
          url: user.html_url ?? `https://github.com/${user.login}`,
          name: user.name ?? undefined,
          bio: user.bio ?? undefined,
          followers: user.followers,
          relevanceReason: candidate.relevanceReason,
          source: candidate.source,
        });
      } catch {
        // Skip deleted or inaccessible accounts.
      }
    }

    return results.sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
  }
}
