import { describe, expect, it } from "vitest";
import { GitMentorConfigSchema, needsModelOnboarding } from "./config.js";

describe("needsModelOnboarding", () => {
  it("returns true for fresh Ollama config", () => {
    const config = GitMentorConfigSchema.parse({});
    expect(needsModelOnboarding(config)).toBe(true);
  });

  it("returns false after model is configured", () => {
    const config = GitMentorConfigSchema.parse({
      llm: { provider: "ollama", model: "qwen3:8b", modelConfigured: true },
    });
    expect(needsModelOnboarding(config)).toBe(false);
  });

  it("returns false for deterministic provider", () => {
    const config = GitMentorConfigSchema.parse({
      llm: { provider: "deterministic", modelConfigured: false },
    });
    expect(needsModelOnboarding(config)).toBe(false);
  });
});
