import { describe, expect, it } from "vitest";
import { GitMentorConfigSchema } from "@git-mentor/core";
import { LLMRouter } from "@git-mentor/llm";
import { runGrowthCoachLLM, runImproveCoachLLM } from "./coaching-llm.js";

const sampleAnalysis = {
  profile: {
    username: "octocat",
    analyzedAt: new Date().toISOString(),
    summary: "Test profile",
    primaryStack: ["TypeScript"],
    skills: [],
    domains: [],
    strengths: [],
    weaknesses: ["Open Source Contributions"],
    maturityScore: 6,
    repoCount: 8,
    publicRepos: 8,
    totalStars: 2,
    metadata: { attractiveness: { score: 7 } },
  },
  gapAnalysis: {
    targetRole: "AI Engineer",
    fitScore: 6.5,
    summary: "Moderate fit",
    gaps: [
      {
        area: "Python",
        currentLevel: "intermediate",
        targetLevel: "advanced",
        priority: 5,
        rationale: "Need more Python evidence",
        evidenceGaps: [],
      },
    ],
    learningPlan: [],
    strengthsForRole: ["TypeScript"],
  },
  actionPlan: {
    generatedAt: new Date().toISOString(),
    recommendations: [
      {
        title: "Improve Open Source Contributions",
        category: "growth",
        description: "Create a recurring habit to address open source contributions.",
        effort: "M",
        rationale: "Weakness",
      },
    ],
    technologiesToLearn: ["Python", "LangGraph"],
    github: { repos: [], profiles: [] },
    ossOpportunities: ["Contribute to a trending repo"],
    profileImprovements: [],
  },
  traces: [],
  signals: {},
  githubData: {
    user: { login: "octocat", bio: "Dev" },
    repos: [
      { name: "ai-code-reviewer-mcp", stargazers_count: 1, language: "TypeScript" },
      { name: "piscine-42", stargazers_count: 0, language: "C" },
    ],
    pinnedRepos: [],
  },
};

describe("coaching-llm", () => {
  it("returns fallback growth markdown in deterministic mode", async () => {
    const config = GitMentorConfigSchema.parse({ llm: { provider: "deterministic" } });
    const router = new LLMRouter(config);
    const fallback = "- **Template** [M] — fallback";
    const result = await runGrowthCoachLLM(router, sampleAnalysis, "ai-engineer", fallback);
    expect(result).toBe(fallback);
  });

  it("returns fallback improve markdown in deterministic mode", async () => {
    const config = GitMentorConfigSchema.parse({ llm: { provider: "deterministic" } });
    const router = new LLMRouter(config);
    const fallback = "- **[pinned] Pin repos**";
    const result = await runImproveCoachLLM(router, sampleAnalysis, "ai-engineer", [], fallback);
    expect(result).toBe(fallback);
  });
});
