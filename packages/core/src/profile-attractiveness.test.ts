import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeProfileAttractiveness } from "./profile-attractiveness.js";
import type { GitHubProfileData } from "./schemas.js";

describe("analyzeProfileAttractiveness", () => {
  it("scores a well-presented profile higher", () => {
    const data: GitHubProfileData = {
      user: {
        login: "dev",
        bio: "AI engineer building agents and RAG systems with TypeScript and Python.",
        public_repos: 12,
        followers: 40,
        following: 20,
        company: "Acme",
      },
      repos: [
        { name: "agent-kit", description: "MCP agents toolkit", stargazers_count: 80, language: "TypeScript" },
        { name: "rag-demo", description: "RAG demo", stargazers_count: 25, language: "Python" },
      ],
      profileReadme: "# Hi, I'm dev\n\nAI engineer portfolio.",
      pinnedRepos: [{ name: "agent-kit" }, { name: "rag-demo" }, { name: "tools" }],
      recentActivity: Array.from({ length: 10 }, (_, index) => ({
        type: "PushEvent",
        repo: "dev/agent-kit",
        createdAt: new Date(Date.now() - index * 86_400_000).toISOString(),
      })),
    };

    const result = analyzeProfileAttractiveness(data);
    expect(result.score).toBeGreaterThan(6);
    expect(result.profileReadmePresent).toBe(true);
    expect(result.pinnedCount).toBe(3);
  });

  it("suggests improvements for an empty profile", () => {
    const data: GitHubProfileData = {
      user: { login: "newbie", public_repos: 1 },
      repos: [{ name: "hello-world" }],
    };

    const result = analyzeProfileAttractiveness(data);
    expect(result.improvements.length).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(6);
  });
});
