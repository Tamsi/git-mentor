import { describe, expect, it } from "vitest";
import {
  buildProfileFollowCandidates,
  formatProfilesToFollowMarkdown,
} from "./profile-discovery.js";

describe("buildProfileFollowCandidates", () => {
  it("returns curated role models excluding the analyzed user", () => {
    const candidates = buildProfileFollowCandidates(
      {
        username: "karpathy",
        analyzedAt: new Date().toISOString(),
        summary: "Test",
        primaryStack: ["Python"],
        skills: [],
        domains: [],
        strengths: [],
        weaknesses: [],
        maturityScore: 8,
        repoCount: 10,
        publicRepos: 10,
        totalStars: 1000,
        metadata: {},
      },
      "ai-engineer",
    );

    expect(candidates.some((entry) => entry.username === "karpathy")).toBe(false);
    expect(candidates.some((entry) => entry.username === "jerryjliu")).toBe(true);
  });

  it("adds maintainers from trending repos", () => {
    const candidates = buildProfileFollowCandidates(
      {
        username: "dev",
        analyzedAt: new Date().toISOString(),
        summary: "Test",
        primaryStack: ["TypeScript"],
        skills: [],
        domains: [],
        strengths: [],
        weaknesses: [],
        maturityScore: 6,
        repoCount: 5,
        publicRepos: 5,
        totalStars: 10,
        metadata: {},
      },
      "ai-engineer",
      [
        {
          fullName: "anomalyco/opencode",
          url: "https://github.com/anomalyco/opencode",
          stars: 1200,
          topics: [],
          relevanceReason: "Trending in your stack",
        },
      ],
    );

    expect(candidates.some((entry) => entry.username === "anomalyco")).toBe(true);
  });
});

describe("formatProfilesToFollowMarkdown", () => {
  it("formats profile entries with links and reasons", () => {
    const markdown = formatProfilesToFollowMarkdown([
      {
        username: "octocat",
        url: "https://github.com/octocat",
        name: "The Octocat",
        bio: "GitHub mascot",
        followers: 9000,
        relevanceReason: "Role model for OSS maintainers",
        source: "curated",
      },
    ]);

    expect(markdown).toContain("[@octocat](https://github.com/octocat)");
    expect(markdown).toContain("Role model for OSS maintainers");
    expect(markdown).toContain("9");
  });
});
