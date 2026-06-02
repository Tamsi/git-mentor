import { describe, expect, it } from "vitest";
import { buildContextSnapshot, formatContextBar } from "./context-stats.js";

describe("context stats", () => {
  it("shows placeholder before profile analysis", () => {
    const snapshot = buildContextSnapshot({
      profileAnalysis: null,
      roleId: "ai-engineer",
      repoAnalyses: [],
      history: [],
      contextLimit: 40960,
      sessionPromptTokens: 0,
      sessionCompletionTokens: 0,
    });
    expect(formatContextBar(snapshot)).toContain("profile not loaded");
  });

  it("formats context usage after profile load", () => {
    const snapshot = buildContextSnapshot({
      profileAnalysis: {
        profile: {
          username: "octocat",
          analyzedAt: new Date().toISOString(),
          summary: "Test",
          primaryStack: ["TypeScript"],
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
        gapAnalysis: null,
        actionPlan: null,
        traces: [],
        signals: {},
      },
      roleId: "ai-engineer",
      repoAnalyses: [],
      history: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ],
      contextLimit: 40960,
      lastUsage: {
        promptTokens: 3200,
        completionTokens: 120,
        totalTokens: 3320,
        source: "provider",
      },
      sessionPromptTokens: 3200,
      sessionCompletionTokens: 120,
    });
    const bar = formatContextBar(snapshot);
    expect(bar).toContain("3.2k / 41k");
    expect(bar).toContain("last +3.2k in / +120 out");
    expect(bar).toContain("1 turn");
  });
});
