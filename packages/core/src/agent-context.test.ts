import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatAgentContextForPrompt,
  loadAgentContext,
  PROJECT_AGENT_DIR,
} from "./agent-context.js";
import type { GitMentorConfig } from "./config.js";

const tempRoots: string[] = [];

function makeTempProject(): { cwd: string; config: GitMentorConfig } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "git-mentor-agent-"));
  tempRoots.push(cwd);

  const agentDir = path.join(cwd, PROJECT_AGENT_DIR);
  fs.mkdirSync(path.join(agentDir, "rules"), { recursive: true });
  fs.mkdirSync(path.join(agentDir, "skills", "repo-review"), { recursive: true });

  fs.writeFileSync(
    path.join(agentDir, "rules", "project-rule.md"),
    "# Project rule\nAlways mention the monorepo context.",
  );
  fs.writeFileSync(
    path.join(agentDir, "skills", "repo-review", "SKILL.md"),
    "# Repo review\n\n## When to use\n- User asks about a repository scan\n\n## Workflow\n1. Summarize stack\n",
  );

  const config: GitMentorConfig = {
    llm: {
      provider: "ollama",
      model: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      temperature: 0.2,
      maxTokens: 4096,
    },
    github: { useGhCli: true },
    defaultRole: "ai-engineer",
    cacheTtlHours: 24,
    agent: {
      activeSkills: ["repo-review"],
      rulesEnabled: true,
      skillsEnabled: true,
    },
    mcp: { servers: [] },
  };

  return { cwd, config };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("loadAgentContext", () => {
  it("loads project-level rules and skills", () => {
    const { cwd, config } = makeTempProject();
    const bundle = loadAgentContext(config, cwd);

    expect(bundle.rules.some((rule) => rule.id === "project-rule")).toBe(true);
    expect(bundle.skills.some((skill) => skill.id === "repo-review")).toBe(true);
    expect(bundle.activeSkillIds).toEqual(["repo-review"]);
  });

  it("formats agent context for the system prompt", () => {
    const { cwd, config } = makeTempProject();
    const bundle = loadAgentContext(config, cwd);
    const prompt = formatAgentContextForPrompt(bundle, config);

    expect(prompt).toContain("=== USER RULES ===");
    expect(prompt).toContain("=== ACTIVE SKILLS ===");
    expect(prompt).toContain("Repo review");
  });

  it("respects skillsEnabled=false", () => {
    const { cwd, config } = makeTempProject();
    config.agent.skillsEnabled = false;
    const bundle = loadAgentContext(config, cwd);
    const prompt = formatAgentContextForPrompt(bundle, config);

    expect(prompt).not.toContain("=== ACTIVE SKILLS ===");
    expect(prompt).toContain("=== USER RULES ===");
  });
});
