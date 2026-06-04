import { describe, expect, it } from "vitest";
import { buildProfileFacts, openingContradictsFacts } from "./profile-facts.js";

describe("buildProfileFacts", () => {
  it("sets pinnedCount from github pinnedRepos", () => {
    const facts = buildProfileFacts(
      {
        profile: {
          username: "octocat",
          analyzedAt: new Date().toISOString(),
          summary: "Test",
          primaryStack: ["TypeScript"],
          skills: [],
          domains: [],
          strengths: [],
          weaknesses: [],
          maturityScore: 6,
          repoCount: 3,
          publicRepos: 3,
          totalStars: 1,
          metadata: {},
        },
        githubData: {
          user: { login: "octocat", bio: "Hi" },
          repos: [{ name: "hello", stargazers_count: 1, language: "TypeScript" }],
          pinnedRepos: [],
        },
        traces: [],
        signals: {},
      },
      "ai-engineer",
    );
    expect(facts.pinnedCount).toBe(0);
    expect(facts.publicRepoCount).toBe(3);
  });
});

describe("openingContradictsFacts", () => {
  const base = {
    username: "t",
    targetRoleId: "ai-engineer",
    targetRoleName: "AI Engineer",
    publicRepoCount: 16,
    pinnedCount: 0,
    pinnedRepoNames: [],
    totalStars: 1,
    followers: 4,
    following: 9,
    attractivenessScore: 7.8,
    fitScore: 6.8,
    bio: "dev",
    profileReadmeExcerpt: null,
    topRepos: [],
    gaps: [],
    strengthsForRole: [],
    weaknesses: [],
    primaryStack: ["TypeScript"],
    maturityScore: 6,
  };

  it("flags false pinned claims when pinnedCount is 0", () => {
    expect(
      openingContradictsFacts("You curated a set of 16 pinned repos.", base),
    ).toBe(true);
  });

  it("allows recommending pins when none exist", () => {
    expect(
      openingContradictsFacts("You have 0 pinned repos — pin git-mentor this week.", base),
    ).toBe(false);
  });
});
