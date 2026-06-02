import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult } from "./schemas.js";

const tempRoots: string[] = [];

function makeAnalysis(username: string): AnalysisResult {
  return {
    profile: {
      username,
      analyzedAt: new Date().toISOString(),
      summary: "Test profile",
      primaryStack: ["TypeScript"],
      skills: [],
      domains: [],
      strengths: [],
      weaknesses: [],
      maturityScore: 5,
      repoCount: 3,
      publicRepos: 3,
      totalStars: 10,
      metadata: {
        attractiveness: {
          score: 6.5,
          bioPresent: true,
          bioLength: 42,
          profileReadmePresent: false,
          pinnedCount: 2,
          reposWithDescription: 2,
          followers: 5,
          following: 3,
          totalStars: 10,
          publicRepos: 3,
          recentActivityCount: 4,
          highlights: ["Bio present"],
          improvements: ["Add profile README"],
        },
      },
    },
    traces: [],
    signals: {},
  };
}

describe("profile dossier", () => {
  beforeEach(() => {
    const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-mentor-reports-"));
    tempRoots.push(reportsDir);
    vi.resetModules();
    vi.doMock("./config.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./config.js")>();
      return {
        ...actual,
        REPORTS_DIR: reportsDir,
        ensureDirs: () => fs.mkdirSync(reportsDir, { recursive: true }),
      };
    });
  });

  afterEach(() => {
    vi.doUnmock("./config.js");
    vi.resetModules();
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("saves and loads a dossier for the same role", async () => {
    const { saveProfileDossier, loadProfileDossier, profileDossierPaths } = await import("./profile-dossier.js");
    const analysis = makeAnalysis("octocat");
    saveProfileDossier(analysis, "ai-engineer");

    const loaded = loadProfileDossier("octocat", "ai-engineer", 24);
    expect(loaded?.profile.username).toBe("octocat");

    const paths = profileDossierPaths("octocat");
    expect(fs.existsSync(paths.markdown)).toBe(true);
    expect(fs.readFileSync(paths.markdown, "utf8")).toContain("Profile attractiveness");
  });

  it("invalidates dossier when role changes", async () => {
    const { saveProfileDossier, loadProfileDossier } = await import("./profile-dossier.js");
    saveProfileDossier(makeAnalysis("octocat"), "ai-engineer");
    expect(loadProfileDossier("octocat", "staff-engineer", 24)).toBeNull();
  });
});
