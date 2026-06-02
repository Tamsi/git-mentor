import { describe, expect, it, vi } from "vitest";

vi.mock("@git-mentor/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@git-mentor/llm")>();
  return {
    ...actual,
    ensureOllamaModel: vi.fn(async (llm: { model: string }) => ({
      model: llm.model,
      changed: false,
    })),
  };
});

import { GitMentorConfigSchema } from "@git-mentor/core";
import { buildDeterministicOpening } from "./prompts.js";
import { ChatSession, formatCommandError, isProfileAnalyzeTarget } from "./session.js";

describe("ChatSession", () => {
  it("handles /help without analysis", async () => {
    const config = GitMentorConfigSchema.parse({ llm: { provider: "deterministic" } });
    const session = new ChatSession(config, "octocat", "ai-engineer");
    const reply = await session.handleInput("/help");
    expect(reply.content).toContain("/analyze profile");
  });

  it("bootstrap does not load GitHub data", async () => {
    const config = GitMentorConfigSchema.parse({ llm: { provider: "deterministic" } });
    const session = new ChatSession(config, "octocat", "ai-engineer");
    const reply = await session.bootstrap();
    expect(reply.analysis).toBeUndefined();
    expect(reply.content).toContain("/analyze profile");
  });

  it("analyze without args shows usage", async () => {
    const config = GitMentorConfigSchema.parse({ llm: { provider: "deterministic" } });
    const session = new ChatSession(config, "octocat", "ai-engineer");
    const reply = await session.handleInput("/analyze");
    expect(reply.content).toContain("profile");
    expect(reply.content).toContain("manifest");
  });

  it("treats /analyze me as profile analysis target", () => {
    expect(isProfileAnalyzeTarget("me")).toBe(true);
    expect(isProfileAnalyzeTarget("profile")).toBe(true);
    expect(isProfileAnalyzeTarget("redbee-mcp")).toBe(false);
  });

  it("formats command errors for chat", () => {
    expect(formatCommandError({ status: 404 }, "Tamsi/me")).toContain("Tamsi/me");
    expect(formatCommandError(new Error("Ollama error: model 'x' not found"))).toContain("LLM error");
  });

  it("prompts for /analyze before free-form chat", async () => {
    const config = GitMentorConfigSchema.parse({ llm: { provider: "deterministic" } });
    const session = new ChatSession(config, "octocat", "ai-engineer");
    await session.bootstrap();
    const reply = await session.handleInput("What are my gaps?");
    expect(reply.content).toContain("/analyze profile");
  });

  it("model command shows current config", async () => {
    const config = GitMentorConfigSchema.parse({
      llm: { provider: "ollama", model: "qwen3:8b" },
    });
    const session = new ChatSession(config, "octocat", "ai-engineer");
    const reply = await session.handleInput("/model");
    expect(reply.content).toContain("ollama/qwen3:8b");
  });

  it("model command updates model name", async () => {
    const config = GitMentorConfigSchema.parse({
      llm: { provider: "ollama", model: "qwen3:8b" },
    });
    const session = new ChatSession(config, "octocat", "ai-engineer");
    const reply = await session.handleInput("/model llama3.2");
    expect(reply.content).toContain("llama3.2");
    expect(config.llm.model).toBe("llama3.2");
  });

  it("buildDeterministicOpening includes username and role context", () => {
    const opening = buildDeterministicOpening(
      {
        profile: {
          username: "octocat",
          analyzedAt: new Date().toISOString(),
          summary: "Test profile",
          primaryStack: ["TypeScript"],
          skills: [{ name: "TypeScript", level: "advanced", confidence: "high", score: 8, evidence: [] }],
          domains: [],
          strengths: ["TypeScript"],
          weaknesses: [],
          maturityScore: 7,
          repoCount: 5,
          publicRepos: 5,
          totalStars: 10,
          metadata: {},
        },
        gapAnalysis: {
          targetRole: "AI Engineer",
          fitScore: 6.5,
          summary: "Moderate fit",
          gaps: [{ area: "MLOps", currentLevel: "minimal", targetLevel: "advanced", priority: 5, rationale: "Need evidence", evidenceGaps: [] }],
          learningPlan: [],
          strengthsForRole: ["TypeScript"],
        },
        actionPlan: {
          generatedAt: new Date().toISOString(),
          recommendations: [{ title: "Ship an ML demo", category: "learning", description: "Build public evidence", effort: "M", rationale: "Gap" }],
          technologiesToLearn: ["LangGraph"],
          reposToWatch: [],
          ossOpportunities: [],
          trendingRepos: [],
          profileImprovements: [],
        },
        traces: [],
        signals: {},
      },
      "ai-engineer",
    );

    expect(opening).toContain("@octocat");
    expect(opening).toContain("MLOps");
    expect(opening).toContain("/gaps");
  });
});
