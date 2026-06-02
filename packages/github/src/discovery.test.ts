import { describe, expect, it } from "vitest";
import { buildDiscoveryQueries } from "./discovery.js";

describe("buildDiscoveryQueries", () => {
  it("builds language and domain queries from profile", () => {
    const queries = buildDiscoveryQueries(
      {
        username: "dev",
        analyzedAt: new Date().toISOString(),
        summary: "Test",
        primaryStack: ["TypeScript", "Python"],
        skills: [],
        domains: [{ name: "AI Engineering", level: "intermediate", confidence: "medium", evidence: [] }],
        strengths: [],
        weaknesses: [],
        maturityScore: 6,
        repoCount: 10,
        publicRepos: 10,
        totalStars: 50,
        metadata: {},
      },
      {
        targetRole: "AI Engineer",
        fitScore: 6,
        summary: "ok",
        gaps: [{ area: "MLOps", currentLevel: "minimal", targetLevel: "advanced", priority: 5, rationale: "gap", evidenceGaps: [] }],
        learningPlan: [],
        strengthsForRole: [],
      },
    );

    expect(queries.some((q) => q.includes("language:typescript"))).toBe(true);
    expect(queries.some((q) => q.includes("topic:llm") || q.includes("topic:machine-learning"))).toBe(true);
  });
});
