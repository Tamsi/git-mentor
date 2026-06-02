import { describe, expect, it } from "vitest";
import { ActionPlanSchema, AnalysisResultSchema } from "./schemas.js";
import { normalizeAnalysisResult } from "./analysis-normalize.js";

describe("normalizeAnalysisResult", () => {
  it("migrates legacy action plan and signals._repos", () => {
    const normalized = normalizeAnalysisResult({
      profile: {
        username: "octocat",
        analyzedAt: new Date().toISOString(),
        summary: "Legacy",
        primaryStack: [],
        skills: [],
        domains: [],
        strengths: [],
        weaknesses: [],
        maturityScore: 5,
        repoCount: 1,
        publicRepos: 1,
        totalStars: 0,
        metadata: {},
      },
      actionPlan: {
        generatedAt: new Date().toISOString(),
        recommendations: [],
        technologiesToLearn: [],
        reposToWatch: ["owner/repo"],
        profilesToFollow: [
          {
            username: "simonw",
            url: "https://github.com/simonw",
            relevanceReason: "Role model",
            source: "curated",
          },
        ],
        ossOpportunities: [],
        trendingRepos: [
          {
            fullName: "owner/repo",
            url: "https://github.com/owner/repo",
            stars: 10,
            relevanceReason: "Trending",
            topics: [],
          },
        ],
        profileImprovements: [],
      },
      traces: [],
      signals: {
        _repos: [{ name: "demo" }],
      },
    });

    expect(normalized.githubData?.repos).toEqual([{ name: "demo" }]);
    expect(normalized.signals).toEqual({});
    expect(normalized.actionPlan?.github.repos[0]?.fullName).toBe("owner/repo");
    expect(normalized.actionPlan?.github.profiles[0]?.username).toBe("simonw");
    expect(AnalysisResultSchema.parse(normalized)).toBeTruthy();
    expect(ActionPlanSchema.parse(normalized.actionPlan)).toBeTruthy();
  });
});
