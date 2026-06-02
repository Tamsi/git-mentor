import { describe, expect, it } from "vitest";
import { buildProfileImprovements } from "./profile-improvement.js";

describe("buildProfileImprovements", () => {
  it("suggests bio when missing", () => {
    const items = buildProfileImprovements(
      {
        username: "dev",
        analyzedAt: new Date().toISOString(),
        summary: "Test",
        primaryStack: ["TypeScript"],
        skills: [],
        domains: [],
        strengths: [],
        weaknesses: [],
        maturityScore: 5,
        repoCount: 3,
        publicRepos: 3,
        totalStars: 0,
        metadata: {},
      },
      undefined,
      { user: { login: "dev" }, repos: [{ name: "a" }, { name: "b" }] },
    );

    expect(items.some((i) => i.category === "bio")).toBe(true);
    expect(items.some((i) => i.category === "pinned")).toBe(true);
  });
});
