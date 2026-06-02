import { describe, expect, it } from "vitest";
import { SkillSignalsEngine } from "./signals.js";

describe("SkillSignalsEngine", () => {
  it("builds a profile from github data", () => {
    const engine = new SkillSignalsEngine();
    const data = {
      user: { login: "demo-dev", name: "Demo", bio: "Backend", public_repos: 2 },
      repos: [
        {
          name: "api",
          description: "FastAPI service",
          language: "Python",
          stargazers_count: 10,
          topics: ["api"],
          dependency_markers: ['"fastapi"', '"langgraph"'],
        },
      ],
    };
    const profile = engine.buildProfile(engine.extract(data));
    expect(profile.username).toBe("demo-dev");
    expect(profile.skills.some((s) => s.name === "Python")).toBe(true);
  });
});
